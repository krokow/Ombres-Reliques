import { moveAndCollide } from '../core/tilemap';
import { COMBAT } from '../data/combat';
import type { GameWorld, Velocity } from '../ecs/components';
import type { Sim } from '../game/sim';

/** Snapshot positions before any system moves things, for render interpolation. */
export function snapshotTransforms(world: GameWorld): void {
  for (const [, t] of world.query('transform')) {
    t.prevX = t.x;
    t.prevY = t.y;
  }
}

/**
 * Accelerates `v` towards (tx, ty): `accel` when there is a target velocity,
 * `decel` when stopping. Gives snappy but non-instant control.
 */
export function steer(
  v: Velocity,
  tx: number,
  ty: number,
  accel: number,
  decel: number,
  dt: number,
): void {
  const dx = tx - v.x;
  const dy = ty - v.y;
  const d = Math.hypot(dx, dy);
  const maxDelta = (tx !== 0 || ty !== 0 ? accel : decel) * dt;
  if (d <= maxDelta) {
    v.x = tx;
    v.y = ty;
  } else {
    v.x += (dx / d) * maxDelta;
    v.y += (dy / d) * maxDelta;
  }
}

/** Integrates velocity + impulse, colliding solid bodies against the tilemap. */
export function integrateMotion(sim: Sim): void {
  const { world, map, dt } = sim;
  const friction = Math.exp(-COMBAT.knockbackFriction * dt);
  for (const [e, t, v] of world.query('transform', 'velocity')) {
    const imp = world.get(e, 'impulse');
    const dx = (v.x + (imp?.x ?? 0)) * dt;
    const dy = (v.y + (imp?.y ?? 0)) * dt;
    const body = world.get(e, 'body');
    if (body?.solid) {
      const r = moveAndCollide(map, t.x, t.y, body.radius, dx, dy);
      t.x = r.x;
      t.y = r.y;
      if (imp && r.hitX) imp.x = 0;
      if (imp && r.hitY) imp.y = 0;
    } else {
      t.x += dx;
      t.y += dy;
    }
    if (imp) {
      imp.x *= friction;
      imp.y *= friction;
    }
  }
}

/** Soft circle-circle push so crowds don't stack. Dashing entities pass through. */
export function separateBodies(sim: Sim): void {
  const { world, map } = sim;
  const bodies = world
    .query('transform', 'body')
    .filter(([e, , b]) => b.pushable && !((world.get(e, 'dash')?.active ?? 0) > 0));
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a) continue;
    const [, ta, ba] = a;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b) continue;
      const [, tb, bb] = b;
      const dx = tb.x - ta.x;
      const dy = tb.y - ta.y;
      const min = ba.radius + bb.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = d2 > 0 ? dx / d : 1;
      const ny = d2 > 0 ? dy / d : 0;
      const overlap = (min - d) * COMBAT.separationStrength;
      const total = ba.weight + bb.weight;
      const pa = moveAndCollide(
        map,
        ta.x,
        ta.y,
        ba.radius,
        (-nx * overlap * bb.weight) / total,
        (-ny * overlap * bb.weight) / total,
      );
      ta.x = pa.x;
      ta.y = pa.y;
      const pb = moveAndCollide(
        map,
        tb.x,
        tb.y,
        bb.radius,
        (nx * overlap * ba.weight) / total,
        (ny * overlap * ba.weight) / total,
      );
      tb.x = pb.x;
      tb.y = pb.y;
    }
  }
}
