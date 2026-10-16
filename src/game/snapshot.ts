import { isClassId, type ClassId } from '../data/classes';
import { CONSUMABLES, RELICS, type RelicId } from '../data/items';
import type { RunBonuses } from '../data/meta';
import { isDifficultyId, type DifficultyId } from '../data/dungeon';
import type { Equipment, Party, Progress, QuickSlot } from '../ecs/components';
import type { RunStats } from './runStats';

/**
 * Everything needed to resume a run at the start of a floor (design 2b).
 * Captured when a floor loads, after per-floor transient state is reset, so
 * restoring it and loading the same floor gives back the exact same game.
 */
export interface RunSnapshot {
  /** Bumped when the snapshot shape or the content it refers to changes incompatibly. */
  format: number;
  seed: string;
  level: number;
  daily: boolean;
  /** Older snapshots (before difficulties) read as 'normal'. */
  difficulty?: DifficultyId;
  members: MemberSnapshot[];
  active: number;
  gold: number;
  keys: number;
  kills: number;
  quick: (QuickSlot | null)[];
  relics: RelicId[];
  relicPool: RelicId[];
  bonuses: RunBonuses;
  rng: { combat: number; spawn: number; ai: number; progress: number; loot: number };
  stats: RunStats;
}

export interface MemberSnapshot {
  classId: ClassId;
  ko: boolean;
  hp: number;
  energy: number;
  mana: number;
  rage: number;
  scars: number;
  progress: Progress;
  equipment: Equipment;
}

export const SNAPSHOT_FORMAT = 1;

const clone = <T>(v: T): T => structuredClone(v);

export function snapshotParty(
  party: Party,
): Pick<
  RunSnapshot,
  'members' | 'active' | 'gold' | 'keys' | 'kills' | 'quick' | 'relics' | 'relicPool' | 'bonuses'
> {
  return {
    members: party.members.map((m) => ({
      classId: m.classId,
      ko: m.ko,
      hp: m.health.hp,
      energy: m.state.energy,
      mana: m.state.mana,
      rage: m.state.rage,
      scars: m.scars,
      progress: clone(m.progress),
      equipment: clone(m.equipment),
    })),
    active: party.active,
    gold: party.gold,
    keys: party.keys,
    kills: party.kills,
    quick: clone(party.quick),
    relics: [...party.relics],
    relicPool: [...party.relicPool],
    bonuses: { ...party.bonuses },
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Shape check for a snapshot read back from storage. Anything off (old
 * format, unknown class or relic, hand-edited save) rejects the whole run
 * rather than resuming a broken one.
 */
export function isValidSnapshot(raw: unknown): raw is RunSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Partial<RunSnapshot>;
  if (s.format !== SNAPSHOT_FORMAT || typeof s.seed !== 'string' || !isNum(s.level)) return false;
  if (s.difficulty !== undefined && !isDifficultyId(s.difficulty)) return false;
  if (!Array.isArray(s.members) || s.members.length === 0 || s.members.length > 3) return false;
  if (
    !s.members.every((m) => isClassId(m.classId) && isNum(m.hp) && typeof m.progress === 'object')
  )
    return false;
  const relicOk = (id: unknown): boolean => typeof id === 'string' && Object.hasOwn(RELICS, id);
  if (!Array.isArray(s.relics) || !s.relics.every(relicOk)) return false;
  if (!Array.isArray(s.relicPool) || !s.relicPool.every(relicOk)) return false;
  if (
    !Array.isArray(s.quick) ||
    !s.quick.every((q) => q === null || Object.hasOwn(CONSUMABLES, q.id))
  )
    return false;
  const r = s.rng;
  if (!r || ![r.combat, r.spawn, r.ai, r.progress, r.loot].every(isNum)) return false;
  return isNum(s.active) && isNum(s.gold) && isNum(s.keys) && typeof s.stats === 'object';
}
