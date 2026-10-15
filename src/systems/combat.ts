import { CLASSES } from '../data/classes';
import { COMBAT, FEEL } from '../data/combat';
import type { Hitbox } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Sim } from '../game/sim';
import { isBehind, rollDamage, shapeHitsCircle } from './combatMath';
import { onPlayerKill } from './player';

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

    for (const [te, tt, tb, th, team] of targets) {
      if (
        team === hb.team ||
        th.hp <= 0 ||
        th.invuln > 0 ||
        hb.hit.has(te) ||
        w.isPendingDestroy(te)
      )
        continue;
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
  const th = w.req(target, 'health');
  const byPlayer = hb.team === 'player';
  const targetIsPlayer = target === sim.player;

  const attacker = w.get(hb.owner, 'player');
  const stats = hb.canCrit && attacker ? CLASSES[attacker.classId] : null;
  const facing = w.get(target, 'facing');
  const backstab =
    stats !== null &&
    facing !== undefined &&
    isBehind(tt.x, tt.y, facing.angle, ox, oy, COMBAT.backstabHalfArc);
  const roll = rollDamage(hb.damage, stats, backstab, sim.rng.combat);

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

  if (!(targetIsPlayer && sim.godMode)) th.hp -= roll.amount;
  const imp = w.get(target, 'impulse');
  const weight = w.get(target, 'body')?.weight ?? 1;
  if (imp) {
    imp.x += (dx * hb.knockback) / weight;
    imp.y += (dy * hb.knockback) / weight;
  }
  th.stagger = Math.max(th.stagger, hb.stagger);

  sim.events.push({
    type: 'hit',
    target,
    x: tt.x,
    y: tt.y,
    damage: roll.amount,
    crit: roll.crit,
    backstab,
    dirX: dx,
    dirY: dy,
    byPlayer,
  });

  if (targetIsPlayer) {
    th.invuln = CLASSES[w.req(target, 'player').classId].hurtInvulnTicks;
    sim.hitstop(FEEL.hitstop.playerHurt);
  } else {
    sim.hitstop(roll.crit ? FEEL.hitstop.crit : FEEL.hitstop.hit);
  }

  if (th.hp <= 0) {
    th.hp = 0;
    const kind = w.get(target, 'renderable')?.kind ?? 'ghoul';
    if (targetIsPlayer) {
      sim.events.push({ type: 'playerDeath', x: tt.x, y: tt.y });
    } else {
      sim.events.push({ type: 'kill', target, kind, x: tt.x, y: tt.y, byPlayer });
      w.destroy(target);
      if (byPlayer) onPlayerKill(sim);
    }
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
