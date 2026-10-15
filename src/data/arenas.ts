import type { EnemyId } from './enemies';

/**
 * Hand-made test arena until procedural generation (M3).
 * `#` wall, `.` floor, `P` player spawn.
 */
export const TEST_ARENA = {
  layout: [
    '##############################',
    '#............................#',
    '#............................#',
    '#....##..............##......#',
    '#....##..............##......#',
    '#............................#',
    '#..........######............#',
    '#............................#',
    '#.....#..............#.......#',
    '#.....#......P.......#.......#',
    '#.....#..............#.......#',
    '#............................#',
    '#..........######............#',
    '#............................#',
    '#....##..............##......#',
    '#....##..............##......#',
    '#............................#',
    '#............................#',
    '##############################',
  ],
  waves: {
    firstWaveSize: 3,
    growthPerWave: 1,
    maxWaveSize: 12,
    /** Enemies never spawn closer than this to the player. */
    minSpawnDistance: 260,
    /** Pause between a cleared wave and the next one. */
    delayTicks: 90,
    pool: [
      { id: 'ghoul', weight: 5, minWave: 1 },
      { id: 'boneArcher', weight: 3, minWave: 2 },
      { id: 'bloater', weight: 2, minWave: 2 },
      { id: 'cryptomancer', weight: 1, minWave: 3 },
    ] satisfies readonly { id: EnemyId; weight: number; minWave: number }[],
    /** Elite chance = clamp(base + perWave * wave, 0, max). */
    eliteChance: { base: -0.1, perWave: 0.05, max: 0.35 },
  },
} as const;
