import { isClassId } from '../data/classes';
import { unlockById, upgradeById } from '../data/meta';
import { isValidSnapshot, type RunSnapshot } from '../game/snapshot';
import { newMeta, type MetaState, type RunRecord } from './meta';

/**
 * Versioned save in localStorage. Each format change bumps SAVE_VERSION and
 * adds a migration from the previous version, so old saves are upgraded
 * step by step instead of being thrown away.
 */
export const SAVE_KEY = 'ombres-reliques.save';
export const SAVE_VERSION = 2;

export interface SaveData {
  version: typeof SAVE_VERSION;
  meta: MetaState;
  /** Run in progress, resumable at the start of its floor (design 2b). */
  run: RunSnapshot | null;
  history: RunRecord[];
  settings: { muted: boolean };
}

/** Minimal storage interface: localStorage in the browser, a Map in tests. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    meta: newMeta(),
    run: null,
    history: [],
    settings: { muted: false },
  };
}

type Raw = Record<string, unknown>;

/**
 * Migrations, keyed by the version they upgrade FROM.
 * v1: meta only ({ shards, unlocked, upgrades }); v2 adds the resumable
 * run, the history, lifetime stats and settings.
 */
const MIGRATIONS: Record<number, (old: Raw) => Raw> = {
  1: (old) => ({
    version: 2,
    meta: {
      ...newMeta(),
      shards: old.shards,
      totalShards: old.shards,
      unlocked: old.unlocked,
      upgrades: old.upgrades,
    },
    run: null,
    history: [],
    settings: { muted: false },
  }),
};

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

/** Keeps only known, well-formed values: a hand-edited or partial save can't break the game. */
function sanitize(raw: Raw): SaveData {
  const m = (typeof raw.meta === 'object' && raw.meta !== null ? raw.meta : {}) as Raw;
  const base = newMeta();
  const unlocked = Array.isArray(m.unlocked)
    ? m.unlocked.filter(
        (id): id is string => typeof id === 'string' && unlockById(id) !== undefined,
      )
    : [];
  const upgrades: Record<string, number> = {};
  if (typeof m.upgrades === 'object' && m.upgrades !== null) {
    for (const [id, rank] of Object.entries(m.upgrades as Raw)) {
      const up = upgradeById(id);
      if (up) upgrades[id] = Math.min(up.costs.length, Math.floor(num(rank)));
    }
  }
  const meta: MetaState = {
    shards: Math.floor(num(m.shards)),
    totalShards: Math.floor(num(m.totalShards)),
    unlocked: [...new Set(unlocked)],
    upgrades,
    runs: num(m.runs, base.runs),
    victories: num(m.victories),
    bestFloor: num(m.bestFloor),
    totalKills: num(m.totalKills),
    lastDaily: typeof m.lastDaily === 'string' ? m.lastDaily : null,
  };
  const history = Array.isArray(raw.history)
    ? (raw.history as RunRecord[]).filter(
        (r) =>
          typeof r === 'object' &&
          r !== null &&
          typeof r.seed === 'string' &&
          Array.isArray(r.team) &&
          r.team.every((id) => typeof id === 'string' && isClassId(id)),
      )
    : [];
  const settings = raw.settings as Raw | undefined;
  return {
    version: SAVE_VERSION,
    meta,
    run: isValidSnapshot(raw.run) ? raw.run : null,
    history,
    settings: { muted: settings?.muted === true },
  };
}

/** Upgrades any known older version, then sanitizes. Unknown/future versions start fresh. */
export function migrate(raw: unknown): { save: SaveData; migratedFrom: number | null } {
  if (typeof raw !== 'object' || raw === null) return { save: freshSave(), migratedFrom: null };
  let data = raw as Raw;
  const from = typeof data.version === 'number' ? data.version : 1;
  if (from > SAVE_VERSION) return { save: freshSave(), migratedFrom: null };
  let v = from;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return { save: freshSave(), migratedFrom: null };
    data = step(data);
    v++;
  }
  return { save: sanitize(data), migratedFrom: from < SAVE_VERSION ? from : null };
}

/** Loads, migrates and writes back the save. A corrupt save is kept aside, not silently lost. */
export class SaveManager {
  data: SaveData;
  /** Human-readable note about what happened at load (migration, corruption…). */
  readonly notice: string | null;

  constructor(private readonly store: KeyValueStore) {
    let notice: string | null = null;
    let data = freshSave();
    try {
      const text = store.getItem(SAVE_KEY);
      if (text !== null) {
        const { save, migratedFrom } = migrate(JSON.parse(text));
        data = save;
        if (migratedFrom !== null)
          notice = `Sauvegarde mise à jour (v${migratedFrom} → v${SAVE_VERSION})`;
      }
    } catch {
      try {
        const text = store.getItem(SAVE_KEY);
        if (text !== null) store.setItem(`${SAVE_KEY}.corrupt`, text);
      } catch {
        // Storage unavailable: play without persistence.
      }
      notice = 'Sauvegarde illisible : mise de côté, nouvelle sauvegarde créée';
    }
    this.data = data;
    this.notice = notice;
    this.write();
  }

  write(): boolean {
    try {
      this.store.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.data = freshSave();
    this.write();
  }
}

/** localStorage if usable (private mode, sandboxed iframes…), else memory only. */
export function browserStore(): KeyValueStore {
  try {
    const probe = '__or_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryStore();
  }
}
