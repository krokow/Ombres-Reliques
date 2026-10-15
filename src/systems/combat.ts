import { CLASSES } from '../data/classes';
import { COMBAT } from '../data/combat';
import type { Hitbox } from '../ecs/components';
import type { Entity } from '../ecs/world';
import { spawnExplosion, spawnZone } from '../game/factories';
import type { Sim } from '../game/sim';
import { isBehind, rollDamage, shapeHitsCircle } from './combatMath';
import { dealDamage } from './damage';
import { applyStatus, hasStatus, removeStatus } from './statuses';
import { hasFlag, memberOf } from './progression';

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
      const frosty = hb.statuses.some((st) => st.id === 'slow');
      if (hb.leavesFire) spawnZone(sim, 'fire', hb.owner, ht.x, ht.y, 40, 150);
      sim.events.push({
        type: 'explosion',
        x: ht.x,
        y: ht.y,
        radius: hb.shape.kind === 'circle' ? hb.shape.radius : 0,
        flavor:
          hb.team === 'player'
            ? frosty
              ? 'frost'
              : 'arcane'
            : hb.statuses.some((st) => st.id === 'poison')
              ? 'plague'
              : 'fire',
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
      if (proj && (proj.burst || --proj.pierceLeft < 0)) {
        burstProjectile(sim, he);
        w.destroy(he);
        break;
      }
    }

    if (--hb.ticks <= 0 && !w.isPendingDestroy(he)) {
      burstProjectile(sim, he);
      w.destroy(he);
    }
  }
}

function applyHit(sim: Sim, hb: Hitbox, ox: number, oy: number, target: Entity): void {
  const w = sim.world;
  const tt = w.req(target, 'transform');
  const byPlayer = hb.team === 'player' || hb.creditPlayer;

  // Stats come from the class that produced the hitbox, even if the player switched since.
  const def = hb.sourceClass ? CLASSES[hb.sourceClass] : null;
  const canCrit = hb.canCrit && def !== null && hb.team === 'player';
  const facing = w.get(target, 'facing');
  const backstab =
    canCrit &&
    def.id === 'shadowBlade' &&
    facing !== undefined &&
    isBehind(tt.x, tt.y, facing.angle, ox, oy, COMBAT.backstabHalfArc);
  // Leaving the smoke veil: the next landed attack is a guaranteed crit.
  const ambush = canCrit && hasStatus(w, sim.player, 'ambush');
  if (ambush) {
    removeStatus(w, sim.player, 'ambush');
    sim.events.push({ type: 'ambushStrike', x: tt.x, y: tt.y });
  }
  const member = hb.sourceClass ? memberOf(sim, hb.sourceClass) : undefined;
  const mods = member?.mods;
  const stats = canCrit
    ? {
        critChance: def.critChance + (mods?.critChance ?? 0),
        critMultiplier: def.critMultiplier,
        backstabMultiplier:
          def.id === 'shadowBlade'
            ? def.backstabMultiplier + (mods?.backstabBonus ?? 0)
            : def.critMultiplier,
      }
    : null;
  let base = hb.damage;
  const wasSlowed = hasStatus(w, target, 'slow');
  // Arcanist passive: slowed targets take extra damage from its spells.
  if (def?.id === 'arcanist' && wasSlowed)
    base *= def.passive.slowedDamageMult + (mods?.slowedBonus ?? 0);
  // Shatter (evolution): frost on an already-slowed target freezes it.
  if (wasSlowed && member?.flags.has('shatter') && hb.statuses.some((st) => st.id === 'slow')) {
    applyStatus(sim, target, 'stun', 45, sim.player);
  }
  // Relic "Œil du chasseur": marked targets take more from the party.
  if (hb.team === 'player' && hasFlag(sim, 'huntersEye') && hasStatus(w, target, 'mark'))
    base *= 1.2;
  const roll = rollDamage(base, stats, backstab, sim.rng.combat, ambush);

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

  for (const s of hb.statuses) {
    applyStatus(sim, target, s.id, s.ticks, hb.creditPlayer ? sim.player : hb.owner);
  }

  if (hb.damage > 0) {
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
  }
  // Shadow Blade passive: backstabs mark the target for later hits.
  if (backstab && def?.id === 'shadowBlade' && w.isAlive(target) && !w.isPendingDestroy(target)) {
    applyStatus(sim, target, 'mark', def.passive.markTicks, hb.owner);
  }
}

/** Projectiles with a burst (frost orb) explode where they stop. */
function burstProjectile(sim: Sim, e: Entity): void {
  const w = sim.world;
  const proj = w.get(e, 'projectile');
  const hb = w.get(e, 'hitbox');
  const t = w.get(e, 'transform');
  if (!proj?.burst || !hb || !t) return;
  const b = proj.burst;
  proj.burst = null;
  spawnExplosion(sim, hb.owner, t.x, t.y, {
    radius: b.radius,
    damage: b.damage,
    knockback: b.knockback,
    delayTicks: 0,
    creditPlayer: hb.team === 'player',
    team: hb.team,
    statuses: b.statuses,
    sourceClass: hb.sourceClass,
  });
}

/** Projectiles die on walls and when their lifetime runs out (via hitbox ticks). */
export function updateProjectiles(sim: Sim): void {
  const w = sim.world;
  for (const [e, , t] of w.query('projectile', 'transform')) {
    if (sim.map.isSolidAt(t.x, t.y)) {
      sim.events.push({ type: 'projectileWall', x: t.x, y: t.y });
      // Burst on the near side of the wall.
      const v = w.get(e, 'velocity');
      if (v) {
        t.x -= v.x * sim.dt;
        t.y -= v.y * sim.dt;
      }
      burstProjectile(sim, e);
      w.destroy(e);
    }
  }
}

export function tickInvulnerability(sim: Sim): void {
  for (const [, h] of sim.world.query('health')) if (h.invuln > 0) h.invuln--;
}
