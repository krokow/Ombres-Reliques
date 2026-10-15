import { ARCANIST, SHADOW_BLADE } from '../data/classes';
import type { Sim } from '../game/sim';
import { applyStatus } from './statuses';

/** The smoke zone containing (x, y) (within `margin`), if any. */
export function smokeAt(
  sim: Sim,
  x: number,
  y: number,
  margin = 0,
): { x: number; y: number; radius: number } | null {
  for (const [, z, t] of sim.world.query('zone', 'transform')) {
    if (
      z.kind === 'smoke' &&
      z.ticks > 0 &&
      (x - t.x) ** 2 + (y - t.y) ** 2 <= (z.radius + margin) ** 2
    ) {
      return { x: t.x, y: t.y, radius: z.radius };
    }
  }
  return null;
}

/**
 * Zones: smoke makes the player invisible inside and grants Ambush when
 * leaving (whoever is active: switching inside the veil is a valid trick);
 * fire keeps burning enemies standing in it.
 */
export function updateZones(sim: Sim): void {
  const w = sim.world;
  for (const [e, z, zt] of w.query('zone', 'transform')) {
    if (--z.ticks <= 0) {
      w.destroy(e);
      continue;
    }
    if (z.kind !== 'fire') continue;
    for (const [en, , t, b] of w.query('enemy', 'transform', 'body')) {
      if ((t.x - zt.x) ** 2 + (t.y - zt.y) ** 2 <= (z.radius + b.radius) ** 2) {
        applyStatus(sim, en, 'burn', ARCANIST.firefield.burnTicks, sim.player);
      }
    }
  }

  const player = w.get(sim.player, 'player');
  const pt = w.get(sim.player, 'transform');
  if (!player || !pt) return;
  const inVeil = sim.playerAlive && smokeAt(sim, pt.x, pt.y) !== null;
  if (inVeil) applyStatus(sim, sim.player, 'invisible', 2);
  if (player.inVeil && !inVeil) {
    applyStatus(sim, sim.player, 'ambush', SHADOW_BLADE.veil.ambushTicks);
    sim.events.push({ type: 'ambush', x: pt.x, y: pt.y });
  }
  player.inVeil = inVeil;
}
