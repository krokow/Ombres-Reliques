/** Visual identity + procedural dressing of each biome (enemy rosters per biome arrive in M7). */
export interface BiomeDef {
  name: string;
  palette: {
    background: string;
    floorA: string;
    floorB: string;
    floorDetail: string;
    wallTop: string;
    wallFace: string;
    wallEdge: string;
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
    palette: {
      background: '#07060b',
      floorA: '#1a1724',
      floorB: '#17141f',
      floorDetail: '#120f18',
      wallTop: '#3a3350',
      wallFace: '#231e31',
      wallEdge: '#4d4469',
    },
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
    palette: {
      background: '#050a07',
      floorA: '#15201a',
      floorB: '#121c16',
      floorDetail: '#0c140f',
      wallTop: '#2c4433',
      wallFace: '#1a2a1f',
      wallEdge: '#4a6b4f',
    },
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
    palette: {
      background: '#0b0505',
      floorA: '#221514',
      floorB: '#1d1110',
      floorDetail: '#3a1a10',
      wallTop: '#4a2e28',
      wallFace: '#2b1916',
      wallEdge: '#a8452a',
    },
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

/** Floor → biome. Temporary 1-floor-per-biome cycle; M7 will give each biome several floors. */
export const FLOOR_BIOMES: readonly BiomeId[] = ['crypt', 'forest', 'forge'];

export function biomeForFloor(level: number): BiomeId {
  return FLOOR_BIOMES[(level - 1) % FLOOR_BIOMES.length] ?? 'crypt';
}
