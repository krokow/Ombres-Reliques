import { CLASS_IDS, CLASSES, type ClassId } from '../data/classes';
import { RELICS, isCurse, type RelicId } from '../data/items';
import {
  META,
  NO_BONUSES,
  UNLOCKS,
  UPGRADES,
  unlockById,
  upgradeById,
  type RunBonuses,
} from '../data/meta';
import { Rng, normalizeSeed } from '../core/rng';
import type { RunStats } from '../game/runStats';
import { ACHIEVEMENTS, type AchievementCondition } from '../data/achievements';
import { ENEMIES, enemyDef, type EnemyId } from '../data/enemies';
import { DIFFICULTIES, type DifficultyId } from '../data/dungeon';

/** Persistent progression across runs. Pure data + pure functions (testable, no DOM). */
export interface MetaState {
  shards: number;
  /** Lifetime shards earned (for the stats screen). */
  totalShards: number;
  unlocked: string[];
  upgrades: Record<string, number>;
  runs: number;
  victories: number;
  bestFloor: number;
  totalKills: number;
  /** Last daily challenge whose rewards were claimed. */
  lastDaily: string | null;
  /** Enemy id → lifetime kills (bestiary). */
  bestiary: Record<string, number>;
  achievements: string[];
  /** Classes that were in a winning team. */
  classWins: ClassId[];
  dailiesDone: number;
}

export function newMeta(): MetaState {
  return {
    shards: 0,
    totalShards: 0,
    unlocked: [],
    upgrades: {},
    runs: 0,
    victories: 0,
    bestFloor: 0,
    totalKills: 0,
    lastDaily: null,
    bestiary: {},
    achievements: [],
    classWins: [],
    dailiesDone: 0,
  };
}

/** Enemies the bestiary tracks: every regular foe, or the bosses. */
export function bestiaryIds(bosses: boolean): EnemyId[] {
  return (Object.keys(ENEMIES) as EnemyId[]).filter(
    (id) => (enemyDef(id).behavior === 'boss') === bosses,
  );
}

function achieved(meta: MetaState, c: AchievementCondition, end: RunEnd): boolean {
  switch (c.kind) {
    case 'floor':
      return end.stats.deepestFloor >= c.floor;
    case 'victory': {
      if (!end.stats.victory) return false;
      const order: DifficultyId[] = ['normal', 'hard', 'nightmare'];
      return order.indexOf(end.difficulty ?? 'normal') >= order.indexOf(c.difficulty ?? 'normal');
    }
    case 'fastVictory':
      return end.stats.victory && end.stats.ticks <= c.minutes * 3600;
    case 'totalKills':
      return meta.totalKills >= c.kills;
    case 'bestiary':
      return bestiaryIds(c.bosses).every((id) => (meta.bestiary[id] ?? 0) > 0);
    case 'daily':
      return meta.dailiesDone > 0;
    case 'allClassesWon':
      return c.classes.every((id) => meta.classWins.includes(id));
  }
}

/** One finished run, as shown in the history. */
export interface RunRecord {
  /** Local date, YYYY-MM-DD. */
  date: string;
  seed: string;
  daily: boolean;
  team: ClassId[];
  floor: number;
  victory: boolean;
  outcome: 'death' | 'victory' | 'abandon';
  kills: number;
  bosses: number;
  ticks: number;
  shards: number;
  difficulty?: DifficultyId;
  /** Achievements unlocked by this run. */
  achievements?: string[];
}

export function unlockedClasses(meta: MetaState): ClassId[] {
  const extra = UNLOCKS.flatMap((u) =>
    u.kind === 'class' && meta.unlocked.includes(u.id) ? [u.classId] : [],
  );
  return CLASS_IDS.filter(
    (id) => (META.startingClasses as readonly string[]).includes(id) || extra.includes(id),
  );
}

/** Relics allowed to drop: every relic not locked behind an unbought pack. */
export function relicPool(meta: MetaState): RelicId[] {
  const locked = new Set(
    UNLOCKS.flatMap((u) => (u.kind === 'relics' && !meta.unlocked.includes(u.id) ? u.relics : [])),
  );
  return (Object.keys(RELICS) as RelicId[]).filter((id) => !isCurse(id) && !locked.has(id));
}

export function allRelics(): RelicId[] {
  return (Object.keys(RELICS) as RelicId[]).filter((id) => !isCurse(id));
}

export function runBonuses(meta: MetaState): RunBonuses {
  const b: RunBonuses = { ...NO_BONUSES };
  for (const up of UPGRADES) {
    const rank = meta.upgrades[up.id] ?? 0;
    for (const [k, v] of Object.entries(up.perRank) as [keyof RunBonuses, number][])
      b[k] += v * rank;
  }
  return b;
}

export type Purchase = { kind: 'unlock'; id: string } | { kind: 'upgrade'; id: string };

/** Cost of the purchase, or null if it isn't available (owned, maxed, locked). */
export function priceOf(meta: MetaState, p: Purchase): number | null {
  if (p.kind === 'unlock') {
    const u = unlockById(p.id);
    if (!u || meta.unlocked.includes(u.id)) return null;
    if (u.kind === 'relics' && u.requires && !meta.unlocked.includes(u.requires)) return null;
    return u.cost;
  }
  const up = upgradeById(p.id);
  if (!up) return null;
  return up.costs[meta.upgrades[up.id] ?? 0] ?? null;
}

export function buy(meta: MetaState, p: Purchase): boolean {
  const price = priceOf(meta, p);
  if (price === null || meta.shards < price) return false;
  meta.shards -= price;
  if (p.kind === 'unlock') meta.unlocked.push(p.id);
  else meta.upgrades[p.id] = (meta.upgrades[p.id] ?? 0) + 1;
  return true;
}

/** Shards earned by a run. Daily rewards are paid once per day, ×1.5. */
export function rewardFor(stats: RunStats, opts: { dailyBonus: boolean }): number {
  const r = META.rewards;
  const floors = Math.max(0, stats.deepestFloor - 1);
  const raw =
    floors * r.perFloorCleared +
    stats.minibosses * r.perMiniboss +
    stats.bosses * r.perBoss +
    (stats.victory ? r.victory : 0) +
    Math.floor(stats.kills / r.killsPerShard);
  return Math.round(raw * (opts.dailyBonus ? r.dailyMult : 1));
}

export interface RunEnd {
  seed: string;
  daily: boolean;
  /** Daily challenge date (YYYY-MM-DD) for daily runs. */
  date: string;
  team: ClassId[];
  stats: RunStats;
  outcome: RunRecord['outcome'];
  difficulty?: DifficultyId;
}

/** Banks a finished run: shards, lifetime stats, history. Returns the record. */
export function recordRun(meta: MetaState, history: RunRecord[], end: RunEnd): RunRecord {
  // Retrying the same daily is allowed, but only the first attempt pays.
  const firstDaily = end.daily && meta.lastDaily !== end.date;
  const mult = DIFFICULTIES[end.difficulty ?? 'normal'].rewards;
  const shards =
    end.daily && !firstDaily
      ? 0
      : Math.round(rewardFor(end.stats, { dailyBonus: firstDaily }) * mult);
  if (firstDaily) meta.lastDaily = end.date;
  meta.shards += shards;
  meta.totalShards += shards;
  meta.runs++;
  if (end.stats.victory) meta.victories++;
  meta.bestFloor = Math.max(meta.bestFloor, end.stats.deepestFloor);
  meta.totalKills += end.stats.kills;
  for (const [id, n] of Object.entries(end.stats.killsByEnemy ?? {}))
    meta.bestiary[id] = (meta.bestiary[id] ?? 0) + n;
  if (end.stats.victory)
    for (const id of end.team) if (!meta.classWins.includes(id)) meta.classWins.push(id);
  if (end.daily) meta.dailiesDone++;
  const unlocked = ACHIEVEMENTS.filter(
    (a) => !meta.achievements.includes(a.id) && achieved(meta, a.condition, end),
  );
  let bonus = 0;
  for (const a of unlocked) {
    meta.achievements.push(a.id);
    bonus += a.reward;
  }
  meta.shards += bonus;
  meta.totalShards += bonus;
  const record: RunRecord = {
    date: end.date,
    seed: end.seed,
    daily: end.daily,
    team: [...end.team],
    floor: end.stats.deepestFloor,
    victory: end.stats.victory,
    outcome: end.outcome,
    kills: end.stats.kills,
    bosses: end.stats.bosses,
    ticks: end.stats.ticks,
    shards: shards + bonus,
    difficulty: end.difficulty ?? 'normal',
    achievements: unlocked.map((a) => a.id),
  };
  history.unshift(record);
  history.length = Math.min(history.length, META.historySize);
  return record;
}

/** Daily challenge: same seed and team for everyone on a given date, no meta bonuses. */
export function dailyChallenge(date: string): { seed: string; team: ClassId[] } {
  const seed = normalizeSeed(`JOUR-${date.replaceAll('-', '')}`);
  const rng = Rng.fromString(seed).fork('daily-team');
  const team = rng.shuffle([...CLASS_IDS]).slice(0, 3);
  return { seed, team };
}

export function className(id: ClassId): string {
  return CLASSES[id].name;
}
