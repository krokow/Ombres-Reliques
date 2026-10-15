import { loopOf } from './biomes';

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
  scaling: { hpPerFloor: 0.15, damagePerFloor: 0.08 },
  /** Endless mode: each loop through the biomes multiplies on top of the floor scaling. */
  endless: { hpPerLoop: 0.4, damagePerLoop: 0.2 },
  encounter: {
    baseEnemies: 2,
    /** One extra enemy per this many interior tiles. */
    tilesPerEnemy: 45,
    perFloor: 1,
    max: 9,
    /** Enemies spawn at least this many tiles from the player. */
    minSpawnTiles: 4,
    eliteChance: { base: 0.02, perFloor: 0.06, max: 0.35 },
    /** Champion packs (floors 1-2 of a biome): escorts around one double-elite champion. */
    championPack: { minibossEscorts: 2, bossEscorts: 3, eliteMods: 2 },
  },
  /** Tiles revealed around the player (fog of war). */
  revealRadius: 6,
} as const;

/** Fraction of max HP restored when taking the stairs. */
export const DESCEND_HEAL = 0.25;

/** Enemy HP and damage multipliers for a floor (floor scaling × endless loops). */
export function difficultyFor(level: number): { hpMult: number; damageMult: number } {
  const loop = loopOf(level);
  return {
    hpMult: (1 + DUNGEON.scaling.hpPerFloor * (level - 1)) * (1 + DUNGEON.endless.hpPerLoop * loop),
    damageMult:
      (1 + DUNGEON.scaling.damagePerFloor * (level - 1)) *
      (1 + DUNGEON.endless.damagePerLoop * loop),
  };
}
