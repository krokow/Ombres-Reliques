import type { EnemyId } from './enemies';

/** Visual identity, procedural dressing and bestiary of each biome. */
export interface BiomeDef {
  name: string;
  /** Regular encounters: weighted pool; `minFloor` is the floor *within* the biome (1-3). */
  roster: readonly { id: EnemyId; weight: number; minFloor: number }[];
  /** True mini-boss and boss, met on the biome's last floor. */
  miniboss: EnemyId;
  boss: EnemyId;
  /** Champion packs guarding the earlier floors' mini-boss / boss rooms. */
  champions: { miniboss: string; boss: string };
  palette: {
    background: string;
    floorA: string;
    floorB: string;
    floorDetail: string;
    wallTop: string;
    wallFace: string;
    wallEdge: string;
  };
  /** Darkness of unlit areas (0..1) and the warm tint torches add. */
  light: { darkness: number; torch: string };
  /** Ambient particles drifting over the floor (render only). */
  ambient: {
    color: string;
    count: number;
    size: number;
    rise: number;
    drift: number;
    glow: boolean;
  };
  dressing: {
    /** Random walks carving outwards from room edges (organic borders). */
    erosionWalks: number;
    erosionLength: number;
    /** Random walks placing wall clusters inside rooms (cover). */
    obstacleWalks: number;
    obstacleLength: number;
    /** Regular pillar grid in large rooms (spacing in tiles, 0 = none). */
    pillarSpacing: number;
  };
}

export const BIOMES = {
  crypt: {
    name: 'Crypte',
    roster: [
      { id: 'ghoul', weight: 5, minFloor: 1 },
      { id: 'boneArcher', weight: 3, minFloor: 1 },
      { id: 'bloater', weight: 2, minFloor: 1 },
      { id: 'cryptomancer', weight: 1, minFloor: 2 },
      { id: 'tombKnight', weight: 2, minFloor: 2 },
      { id: 'wraith', weight: 2, minFloor: 2 },
    ],
    miniboss: 'ossuaryWarden',
    boss: 'cryptarch',
    champions: { miniboss: 'Sentinelle des caveaux', boss: 'Maître des cryptes' },
    palette: {
      background: '#07060b',
      floorA: '#1a1724',
      floorB: '#17141f',
      floorDetail: '#120f18',
      wallTop: '#3a3350',
      wallFace: '#231e31',
      wallEdge: '#4d4469',
    },
    light: { darkness: 0.52, torch: '255, 170, 90' },
    ambient: { color: '#9c94b8', count: 40, size: 1.5, rise: 4, drift: 6, glow: false },
    dressing: {
      erosionWalks: 0,
      erosionLength: 0,
      obstacleWalks: 0,
      obstacleLength: 0,
      pillarSpacing: 4,
    },
  },
  forest: {
    name: 'Forêt corrompue',
    roster: [
      { id: 'thornWolf', weight: 5, minFloor: 1 },
      { id: 'thornShooter', weight: 3, minFloor: 1 },
      { id: 'sporeling', weight: 2, minFloor: 1 },
      { id: 'rootShaman', weight: 1, minFloor: 2 },
      { id: 'cursedStag', weight: 2, minFloor: 2 },
      { id: 'sapJelly', weight: 2, minFloor: 1 },
      { id: 'burrower', weight: 2, minFloor: 2 },
    ],
    miniboss: 'thornMother',
    boss: 'paleStag',
    champions: { miniboss: 'Rôdeur des ronces', boss: 'Seigneur du sous-bois' },
    palette: {
      background: '#050a07',
      floorA: '#15201a',
      floorB: '#121c16',
      floorDetail: '#0c140f',
      wallTop: '#2c4433',
      wallFace: '#1a2a1f',
      wallEdge: '#4a6b4f',
    },
    light: { darkness: 0.42, torch: '190, 255, 140' },
    ambient: { color: '#a6e06a', count: 55, size: 2, rise: 9, drift: 14, glow: true },
    dressing: {
      erosionWalks: 4,
      erosionLength: 10,
      obstacleWalks: 2,
      obstacleLength: 5,
      pillarSpacing: 0,
    },
  },
  forge: {
    name: 'Forge volcanique',
    roster: [
      { id: 'cinderImp', weight: 5, minFloor: 1 },
      { id: 'emberMortar', weight: 2, minFloor: 1 },
      { id: 'slagBomb', weight: 2, minFloor: 1 },
      { id: 'magmaGolem', weight: 2, minFloor: 1 },
      { id: 'forgeWarden', weight: 1, minFloor: 2 },
      { id: 'brassBull', weight: 2, minFloor: 2 },
      { id: 'shieldBearer', weight: 2, minFloor: 1 },
      { id: 'ashPriestess', weight: 1, minFloor: 2 },
    ],
    miniboss: 'fallenSmith',
    boss: 'forgeHeart',
    champions: { miniboss: 'Brute des fourneaux', boss: 'Gardien de l’enclume' },
    palette: {
      background: '#0b0505',
      floorA: '#221514',
      floorB: '#1d1110',
      floorDetail: '#3a1a10',
      wallTop: '#4a2e28',
      wallFace: '#2b1916',
      wallEdge: '#a8452a',
    },
    light: { darkness: 0.38, torch: '255, 120, 50' },
    ambient: { color: '#ffb347', count: 70, size: 1.8, rise: 30, drift: 10, glow: true },
    dressing: {
      erosionWalks: 2,
      erosionLength: 6,
      obstacleWalks: 3,
      obstacleLength: 4,
      pillarSpacing: 0,
    },
  },
} as const satisfies Record<string, BiomeDef>;

export type BiomeId = keyof typeof BIOMES;

/** Biome order of a run; the endless mode loops over it (choice 2b). */
export const FLOOR_BIOMES: readonly BiomeId[] = ['crypt', 'forest', 'forge'];
/** Choice 1b: three floors per biome, the true mini-boss and boss on the third. */
export const FLOORS_PER_BIOME = 3;
/** Beating the boss of this floor wins the run (then endless mode). */
export const RUN_FLOORS = FLOOR_BIOMES.length * FLOORS_PER_BIOME;

export function biomeForFloor(level: number): BiomeId {
  const index = Math.floor((level - 1) / FLOORS_PER_BIOME) % FLOOR_BIOMES.length;
  return FLOOR_BIOMES[index] ?? 'crypt';
}

/** 1..FLOORS_PER_BIOME: position of a floor inside its biome. */
export function floorInBiome(level: number): number {
  return ((level - 1) % FLOORS_PER_BIOME) + 1;
}

/** 0 for the first run through the biomes, 1+ in endless mode. */
export function loopOf(level: number): number {
  return Math.floor((level - 1) / RUN_FLOORS);
}
