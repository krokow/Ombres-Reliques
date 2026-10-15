import { CLASSES } from '../data/classes';
import { COMBAT } from '../data/combat';
import type { Hitbox } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Sim } from '../game/sim';
import { isBehind, rollDamage, shapeHitsCircle } from './combatMath';
import { dealDamage } from './damage';
import { applyStatus, hasStatus, removeStatus } from './statuses';

/** Moves attached hitboxes, resolves overlaps with hurtboxes, expires them. */
export function resolveHitboxes(sim: Sim): void {
  const w = sim.world;
  const targets = w.query('transform', 'body', 'health', 'team');

  for (const [he, hb, ht] of w.query('hitbox', 'transform')) {
    if (hb.attached) {
      const ot = w.get(hb.owner, 'transform');
      if (!ot || w.isPendingDestroy(hb.owner)) {
        w.destroy(he);
        continue;
      }
      ht.x = ot.x;
      ht.y = ot.y;
    }
    if (hb.delay > 0) {
      hb.delay--;
      continue;
    }
    if (w.get(he, 'renderable')?.kind === 'explosion') {
      sim.events.push({
        type: 'explosion',
        x: ht.x,
        y: ht.y,
        radius: hb.shape.kind === 'circle' ? hb.shape.radius : 0,
      });
    }

    for (const [te, tt, tb, th, team] of targets) {
      if (hb.team !== 'neutral' && team === hb.team) continue;
      if (th.hp <= 0 || th.invuln > 0 || hb.hit.has(te) || w.isPendingDestroy(te)) continue;
      if (!shapeHitsCircle(hb.shape, ht.x, ht.y, hb.angle, tt.x, tt.y, tb.radius)) continue;
      // No hitting through walls (sweeping arcs would otherwise reach behind pillars).
      if (!sim.map.lineOfSight(ht.x, ht.y, tt.x, tt.y)) continue;
      hb.hit.add(te);
      applyHit(sim, hb, ht.x, ht.y, te);
      const proj = w.get(he, 'projectile');
      if (proj && --proj.pierceLeft < 0) {
        w.destroy(he);
        break;
      }
    }

    if (--hb.ticks <= 0) w.destroy(he);
  }
}

function applyHit(sim: Sim, hb: Hitbox, ox: number, oy: number, target: Entity): void {
  const w = sim.world;
  const tt = w.req(target, 'transform');
  const byPlayer = hb.team === 'player' || hb.creditPlayer;

  const attacker = w.get(hb.owner, 'player');
  const def = attacker ? CLASSES[attacker.classId] : null;
  const stats = hb.canCrit && def ? def : null;
  const facing = w.get(target, 'facing');
  const backstab =
    stats !== null &&
    facing !== undefined &&
    isBehind(tt.x, tt.y, facing.angle, ox, oy, COMBAT.backstabHalfArc);
  // Leaving the smoke veil: the next landed attack is a guaranteed crit.
  const ambush = stats !== null && hasStatus(w, hb.owner, 'ambush');
  if (ambush) {
    removeStatus(w, hb.owner, 'ambush');
    sim.events.push({ type: 'ambushStrike', x: tt.x, y: tt.y });
  }
  const roll = rollDamage(hb.damage, stats, backstab, sim.rng.combat, ambush);

  let dx = tt.x - ox;
  let dy = tt.y - oy;
  const d = Math.hypot(dx, dy);
  if (d > 1e-6) {
    dx /= d;
    dy /= d;
  } else {
    dx = Math.cos(hb.angle);
    dy = Math.sin(hb.angle);
  }

  for (const s of hb.statuses)
    applyStatus(sim, target, s.id, s.ticks, hb.creditPlayer ? sim.player : hb.owner);

  dealDamage(sim, target, {
    amount: roll.amount,
    source: hb.owner,
    byPlayer,
    crit: roll.crit,
    backstab,
    dirX: dx,
    dirY: dy,
    knockback: hb.knockback,
    stagger: hb.stagger,
    dot: false,
    originX: ox,
    originY: oy,
  });
  // Passive: backstabs mark the target (more damage taken, Execution priority) for later hits.
  if (backstab && def && w.isAlive(target) && !w.isPendingDestroy(target)) {
    applyStatus(sim, target, 'mark', def.passive.markTicks, hb.owner);
  }
}

/** Projectiles die on walls and when their lifetime runs out (via hitbox ticks). */
export function updateProjectiles(sim: Sim): void {
  const w = sim.world;
  for (const [e, , t] of w.query('projectile', 'transform')) {
    if (sim.map.isSolidAt(t.x, t.y)) {
      sim.events.push({ type: 'projectileWall', x: t.x, y: t.y });
      w.destroy(e);
    }
  }
}

export function tickInvulnerability(sim: Sim): void {
  for (const [, h] of sim.world.query('health')) if (h.invuln > 0) h.invuln--;
}
