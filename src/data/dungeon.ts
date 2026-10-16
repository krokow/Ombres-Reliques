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
  scaling: { hpPerFloor: 0.18, damagePerFloor: 0.12 },
  /** Endless mode: each loop through the biomes multiplies on top of the floor scaling. */
  endless: { hpPerLoop: 0.4, damagePerLoop: 0.2 },
  encounter: {
    baseEnemies: 3,
    /** One extra enemy per this many interior tiles. */
    tilesPerEnemy: 45,
    perFloor: 1,
    max: 10,
    /** Enemies spawn at least this many tiles from the player. */
    minSpawnTiles: 4,
    eliteChance: { base: 0.05, perFloor: 0.06, max: 0.4 },
    /** Champion packs (floors 1-2 of a biome): escorts around one double-elite champion. */
    championPack: { minibossEscorts: 2, bossEscorts: 3, eliteMods: 2 },
  },
  /** Tiles revealed around the player (fog of war). */
  revealRadius: 6,
} as const;

/** Fraction of max HP restored when taking the stairs. */
export const DESCEND_HEAL = 0.2;

/** Chosen per run on the team screen. Everything multiplies the base tuning above. */
export interface DifficultyDef {
  name: string;
  desc: string;
  enemyHp: number;
  enemyDamage: number;
  /** More enemies per combat room. */
  enemyCount: number;
  eliteChanceBonus: number;
  /** Party healing (stairs, reserve regeneration). */
  healing: number;
  /** Éclats earned at the end of the run. */
  rewards: number;
}

export const DIFFICULTIES = {
  normal: {
    name: 'Normal',
    desc: 'L’expérience prévue.',
    enemyHp: 1,
    enemyDamage: 1,
    enemyCount: 1,
    eliteChanceBonus: 0,
    healing: 1,
    rewards: 1,
  },
  hard: {
    name: 'Difficile',
    desc: 'Ennemis +35 % PV, +30 % dégâts, plus nombreux ; soins réduits. Éclats ×1,5.',
    enemyHp: 1.35,
    enemyDamage: 1.3,
    enemyCount: 1.25,
    eliteChanceBonus: 0.1,
    healing: 0.6,
    rewards: 1.5,
  },
  nightmare: {
    name: 'Cauchemar',
    desc: 'Ennemis +80 % PV, +65 % dégâts, en hordes d’élites ; presque aucun soin. Éclats ×2,5.',
    enemyHp: 1.8,
    enemyDamage: 1.65,
    enemyCount: 1.5,
    eliteChanceBonus: 0.2,
    healing: 0.3,
    rewards: 2.5,
  },
} as const satisfies Record<string, DifficultyDef>;

export type DifficultyId = keyof typeof DIFFICULTIES;

export function isDifficultyId(id: unknown): id is DifficultyId {
  return typeof id === 'string' && Object.hasOwn(DIFFICULTIES, id);
}

/** Enemy HP and damage multipliers for a floor (floor scaling × endless loops × difficulty). */
export function difficultyFor(
  level: number,
  difficulty: DifficultyId = 'normal',
): { hpMult: number; damageMult: number } {
  const loop = loopOf(level);
  const d: DifficultyDef = DIFFICULTIES[difficulty];
  return {
    hpMult:
      (1 + DUNGEON.scaling.hpPerFloor * (level - 1)) *
      (1 + DUNGEON.endless.hpPerLoop * loop) *
      d.enemyHp,
    damageMult:
      (1 + DUNGEON.scaling.damagePerFloor * (level - 1)) *
      (1 + DUNGEON.endless.damagePerLoop * loop) *
      d.enemyDamage,
  };
}
