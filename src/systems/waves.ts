import { clamp } from '../core/math';
import { TEST_ARENA } from '../data/arenas';
import { ELITE_MODIFIERS, type EliteModifierId } from '../data/elites';
import type { EnemyId } from '../data/enemies';
import { spawnEnemy, type SpawnEnemyOptions } from '../game/factories';
import type { Sim } from '../game/sim';

export interface WaveState {
  wave: number;
  timer: number;
}

export function waveSize(wave: number): number {
  const w = TEST_ARENA.waves;
  return Math.min(w.maxWaveSize, w.firstWaveSize + (wave - 1) * w.growthPerWave);
}

export function eliteChance(wave: number): number {
  const c = TEST_ARENA.waves.eliteChance;
  return clamp(c.base + c.perWave * wave, 0, c.max);
}

/** Floor tiles far enough from the player for a fair spawn. */
export function spawnCandidates(sim: Sim, minDistance: number): { x: number; y: number }[] {
  const pt = sim.world.get(sim.player, 'transform');
  const out: { x: number; y: number }[] = [];
  const { map } = sim;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.isSolid(tx, ty)) continue;
      const c = map.tileCenter(tx, ty);
      if (pt && Math.hypot(c.x - pt.x, c.y - pt.y) < minDistance) continue;
      out.push(c);
    }
  }
  return out;
}

export function spawnGroup(
  sim: Sim,
  id: EnemyId,
  count: number,
  opts: SpawnEnemyOptions = {},
): number {
  const candidates = spawnCandidates(sim, TEST_ARENA.waves.minSpawnDistance);
  if (candidates.length === 0) return 0;
  sim.rng.spawn.shuffle(candidates);
  for (let i = 0; i < count; i++) {
    const c = candidates[i % candidates.length];
    if (c) spawnEnemy(sim, id, c.x, c.y, opts);
  }
  return count;
}

/** Draws a wave composition from the data pool (seeded). */
export function rollWave(sim: Sim, wave: number): { id: EnemyId; elite: EliteModifierId[] }[] {
  const pool = TEST_ARENA.waves.pool
    .filter((p) => p.minWave <= wave)
    .map((p) => ({ weight: p.weight, value: p.id }));
  const mods = Object.keys(ELITE_MODIFIERS) as EliteModifierId[];
  const out: { id: EnemyId; elite: EliteModifierId[] }[] = [];
  for (let i = 0; i < waveSize(wave); i++) {
    const id = sim.rng.spawn.weighted(pool);
    const elite = sim.rng.spawn.chance(eliteChance(wave)) ? [sim.rng.spawn.pick(mods)] : [];
    out.push({ id, elite });
  }
  return out;
}

/** Endless test waves; replaced by room encounters in M3. */
export function updateWaves(sim: Sim, state: WaveState): void {
  if (sim.world.query('enemy').length > 0) return;
  if (++state.timer < TEST_ARENA.waves.delayTicks && state.wave > 0) return;
  state.timer = 0;
  state.wave++;
  const composition = rollWave(sim, state.wave);
  const candidates = spawnCandidates(sim, TEST_ARENA.waves.minSpawnDistance);
  sim.rng.spawn.shuffle(candidates);
  composition.forEach((c, i) => {
    const pos = candidates[i % Math.max(1, candidates.length)];
    if (pos) spawnEnemy(sim, c.id, pos.x, pos.y, { elite: c.elite });
  });
  sim.events.push({ type: 'wave', wave: state.wave, count: composition.length });
}
