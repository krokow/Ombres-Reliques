import { TEST_ARENA } from '../data/arenas';
import type { EnemyId } from '../data/enemies';
import { spawnEnemy } from '../game/factories';
import type { Sim } from '../game/sim';

export interface WaveState {
  wave: number;
  timer: number;
}

export function waveSize(wave: number): number {
  const w = TEST_ARENA.waves;
  return Math.min(w.maxWaveSize, w.firstWaveSize + (wave - 1) * w.growthPerWave);
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

export function spawnGroup(sim: Sim, id: EnemyId, count: number): number {
  const candidates = spawnCandidates(sim, TEST_ARENA.waves.minSpawnDistance);
  if (candidates.length === 0) return 0;
  sim.rng.spawn.shuffle(candidates);
  for (let i = 0; i < count; i++) {
    const c = candidates[i % candidates.length];
    if (c) spawnEnemy(sim, id, c.x, c.y);
  }
  return count;
}

/** Endless test waves for M1; replaced by room encounters in M3. */
export function updateWaves(sim: Sim, state: WaveState): void {
  if (sim.world.query('enemy').length > 0) return;
  if (++state.timer < TEST_ARENA.waves.delayTicks && state.wave > 0) return;
  state.timer = 0;
  state.wave++;
  const count = spawnGroup(sim, 'ghoul', waveSize(state.wave));
  sim.events.push({ type: 'wave', wave: state.wave, count });
}
