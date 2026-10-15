import type { GameWorld } from '../ecs/components';

/** Snapshot positions before any system moves things, for render interpolation. */
export function snapshotTransforms(world: GameWorld): void {
  for (const [, t] of world.query('transform')) {
    t.prevX = t.x;
    t.prevY = t.y;
  }
}

/** Plain Euler integration (no collision). */
export function integrateVelocity(world: GameWorld, dt: number): void {
  for (const [, t, v] of world.query('transform', 'velocity')) {
    t.x += v.x * dt;
    t.y += v.y * dt;
  }
}
