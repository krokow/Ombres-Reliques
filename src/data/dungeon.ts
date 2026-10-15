import type { EliteModifierId } from './elites';
import type { EnemyId } from './enemies';

export interface EncounterEntry {
  id: EnemyId;
  count?: number;
  elite?: readonly EliteModifierId[];
  /** Marks the encounter's champion (gets the top-screen HP bar). */
  champion?: string;
}

/** Floor generation & encounter tuning. Sizes in tiles. */
export const DUNGEON = {
  width: 72,
  height: 54,
  bsp: {
    /** Leaves are never split below this size. */
    minLeaf: 11,
    maxDepth: 5,
    /** Wall tiles kept between a room and its leaf border. */
    padding: 1,
    minRoom: 6,
    maxRoom: 14,
  },
  corridorWidth: 2,
  /** Erosion never carves further than this from a room's original rectangle. */
  erosionMaxDepth: 2,
  /** Extra corridors (loops) as a fraction of the room count. */
  extraLoops: 0.2,
  minRooms: 8,
  /** Boss room must be at least this many rooms away from the start. */
  minBossDepth: 3,
  specials: { treasure: [1, 2], shop: 1, altar: 1 },
  secretRoom: { minSize: 4, maxSize: 5 },
  maxAttempts: 40,
  /** Per-floor enemy scaling (floor 1 = ×1). */
  scaling: { hpPerFloor: 0.18, damagePerFloor: 0.1 },
  encounter: {
    baseEnemies: 2,
    /** One extra enemy per this many interior tiles. */
    tilesPerEnemy: 45,
    perFloor: 1,
    max: 9,
    /** Enemies spawn at least this many tiles from the player. */
    minSpawnTiles: 4,
    eliteChance: { base: 0.02, perFloor: 0.06, max: 0.35 },
    pool: [
      { id: 'ghoul', weight: 5, minFloor: 1 },
      { id: 'boneArcher', weight: 3, minFloor: 1 },
      { id: 'bloater', weight: 2, minFloor: 1 },
      { id: 'cryptomancer', weight: 1, minFloor: 2 },
    ] satisfies readonly { id: EnemyId; weight: number; minFloor: number }[],
    /** Placeholders until real mini-bosses and bosses (M7). */
    miniboss: [
      { id: 'ghoul', elite: ['armored', 'enraged'], champion: 'Goule colossale' },
      { id: 'boneArcher', count: 2 },
    ] satisfies readonly EncounterEntry[],
    boss: [
      { id: 'cryptomancer', elite: ['armored', 'vampiric'], champion: 'Le Cryptarque' },
      { id: 'ghoul', count: 2 },
      { id: 'bloater', count: 1 },
    ] satisfies readonly EncounterEntry[],
  },
  /** Tiles revealed around the player (fog of war). */
  revealRadius: 6,
} as const;

/** Fraction of max HP restored when taking the stairs. */
export const DESCEND_HEAL = 0.25;
