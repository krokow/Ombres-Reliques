import { SUMMONER, type AllyDef } from '../data/classes';
import type { Ally } from '../ecs/components';
import type { Entity } from '../ecs/world';
import { spawnAlly, spawnExplosion, spawnHitbox } from '../game/factories';
import type { Sim } from '../game/sim';
import { steer } from './movement';
import { hasFlag, memberOf } from './progression';
import { hasStatus, isStunned, moveMultiplier } from './statuses';

/**
 * Invocateur summons. They target enemies on their own (focus from "Ordre"
 * first, then marked enemies, then the nearest), follow the player when idle
 * and fade when their time runs out. Enemies don't hunt them, but their
 * attacks hit whatever stands in the way.
 */

function allyDef(a: Ally): AllyDef & { slamRadius?: number } {
  return a.kind === 'wisp' ? SUMMONER.wisp : SUMMONER.colossus;
}

export function wispCount(sim: Sim): number {
  return sim.world.query('ally').filter(([, a]) => a.kind === 'wisp').length;
}

export function maxWisps(sim: Sim): number {
  return SUMMONER.summon.maxWisps + (memberOf(sim, 'summoner')?.mods.maxMinionsBonus ?? 0);
}

/** Summons up to `count` wisps around (x, y), respecting the cap. Returns how many came. */
export function summonWisps(sim: Sim, x: number, y: number, count: number): number {
  const mods = memberOf(sim, 'summoner')?.mods;
  const room = Math.max(0, maxWisps(sim) - wispCount(sim));
  const n = Math.min(count, room);
  for (let i = 0; i < n; i++) {
    const a = sim.rng.combat.range(-Math.PI, Math.PI);
    let px = x + Math.cos(a) * 18;
    let py = y + Math.sin(a) * 18;
    if (sim.map.isSolidAt(px, py)) {
      px = x;
      py = y;
    }
    spawnAlly(sim, 'wisp', px, py, {
      lifePct: mods?.minionLifePct ?? 0,
      damagePct: mods?.minionDamagePct ?? 0,
    });
  }
  return n;
}

export function summonColossus(sim: Sim, x: number, y: number): void {
  const mods = memberOf(sim, 'summoner')?.mods;
  const opts = { lifePct: mods?.minionLifePct ?? 0, damagePct: mods?.minionDamagePct ?? 0 };
  spawnAlly(sim, 'colossus', x, y, opts);
  if (hasFlag(sim, 'twinColossus', 'summoner')) spawnAlly(sim, 'colossus', x + 30, y, opts);
}

/** Every summon rushes `target` (or regroups on the point when there is none). */
export function commandAllies(sim: Sim, target: Entity | null, rushTicks: number): number {
  let n = 0;
  for (const [, a] of sim.world.query('ally')) {
    a.target = target;
    a.rush = rushTicks;
    a.cooldown = Math.min(a.cooldown, 6);
    n++;
  }
  return n;
}

function validTarget(sim: Sim, e: Entity | null): e is Entity {
  if (e === null || !sim.world.isAlive(e) || sim.world.isPendingDestroy(e)) return false;
  return (sim.world.get(e, 'health')?.hp ?? 0) > 0 && sim.world.has(e, 'enemy');
}

function pickTarget(sim: Sim, x: number, y: number, leash: number): Entity | null {
  const w = sim.world;
  const pt = w.req(sim.player, 'transform');
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const [e, , t, h] of w.query('enemy', 'transform', 'health')) {
    if (h.hp <= 0 || w.isPendingDestroy(e)) continue;
    if (Math.hypot(t.x - pt.x, t.y - pt.y) > leash) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d > 320 || !sim.map.lineOfSight(x, y, t.x, t.y)) continue;
    // Marked enemies (lash, backstab) are preferred.
    const score = d * (hasStatus(w, e, 'mark') ? 0.4 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** A summon disappears: time ran out or it was destroyed. */
export function fadeAlly(sim: Sim, e: Entity): void {
  const w = sim.world;
  const a = w.get(e, 'ally');
  const t = w.get(e, 'transform');
  if (!a || !t || w.isPendingDestroy(e)) return;
  // Evolution "Tempête d'âmes": wisps go out with a bang.
  const burst = a.kind === 'wisp' && hasFlag(sim, 'soulStorm', 'summoner');
  if (burst) {
    spawnExplosion(sim, sim.player, t.x, t.y, {
      radius: SUMMONER.wispBurst.radius,
      damage: Math.round(SUMMONER.wispBurst.damage * a.damageMult),
      knockback: 200,
      delayTicks: 0,
      creditPlayer: true,
      team: 'player',
      sourceClass: 'summoner',
    });
  }
  sim.events.push({ type: 'allyFade', kind: a.kind, x: t.x, y: t.y, burst });
  w.destroy(e);
}

function strike(sim: Sim, e: Entity, a: Ally, def: AllyDef & { slamRadius?: number }): void {
  const w = sim.world;
  const t = w.req(e, 'transform');
  const angle = w.req(e, 'facing').angle;
  const body = w.req(e, 'body');
  const slam = a.kind === 'colossus';
  const offset = slam ? 0 : body.radius + def.reach;
  spawnHitbox(sim, t.x, t.y, {
    owner: e,
    team: 'player',
    shape: { kind: 'circle', radius: slam ? (def.slamRadius ?? 50) : def.hitRadius, offset },
    angle,
    damage: Math.round(def.damage * a.damageMult),
    knockback: def.knockback,
    stagger: def.stagger,
    delay: 0,
    ticks: slam ? 2 : 4,
    attached: true,
    canCrit: true,
    sourceClass: 'summoner',
    statuses: hasFlag(sim, 'soulfire', 'summoner') ? [{ id: 'burn', ticks: 60 }] : [],
  });
  if (!slam) {
    const imp = w.req(e, 'impulse');
    imp.x += Math.cos(angle) * 260;
    imp.y += Math.sin(angle) * 260;
  }
  sim.events.push({ type: 'allyStrike', kind: a.kind, x: t.x, y: t.y, angle });
}

export function updateAllies(sim: Sim): void {
  const w = sim.world;
  const pt = w.req(sim.player, 'transform');
  const index = new Map<Entity, number>();
  w.query('ally').forEach(([e], i) => index.set(e, i));

  for (const [e, a, t, v] of w.query('ally', 'transform', 'velocity')) {
    if (w.isPendingDestroy(e)) continue;
    if (--a.life <= 0) {
      fadeAlly(sim, e);
      continue;
    }
    const def = allyDef(a);
    if (a.cooldown > 0) a.cooldown -= a.rush > 0 ? 2 : 1;
    if (a.rush > 0) a.rush--;
    const mover = w.req(e, 'mover');
    const facing = w.req(e, 'facing');
    const health = w.req(e, 'health');
    if (isStunned(w, e) || health.stagger > 0) {
      if (health.stagger > 0) health.stagger--;
      a.windup = -1;
      steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
      continue;
    }

    // Lost behind walls or far away: the summon slips back to the player's side.
    const toPlayer = Math.hypot(pt.x - t.x, pt.y - t.y);
    a.lost = sim.map.lineOfSight(t.x, t.y, pt.x, pt.y) && toPlayer < def.leash ? 0 : a.lost + 1;
    if (a.lost > 90 || toPlayer > def.leash * 1.6) {
      t.x = t.prevX = pt.x;
      t.y = t.prevY = pt.y;
      a.lost = 0;
      a.target = null;
      continue;
    }

    if (!validTarget(sim, a.target)) a.target = pickTarget(sim, t.x, t.y, def.leash);
    const speed =
      mover.moveSpeed * moveMultiplier(w, e) * (a.rush > 0 ? SUMMONER.command.rushSpeedMult : 1);

    if (a.windup >= 0) {
      steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
      if (++a.windup >= def.windupTicks) {
        strike(sim, e, a, def);
        a.windup = -1;
        a.cooldown = def.cooldownTicks;
      }
      continue;
    }

    if (validTarget(sim, a.target)) {
      const tt = w.req(a.target, 'transform');
      const tb = w.req(a.target, 'body');
      const dx = tt.x - t.x;
      const dy = tt.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      facing.angle = Math.atan2(dy, dx);
      const reach = w.req(e, 'body').radius + tb.radius + def.reach + 4;
      const slamReach = a.kind === 'colossus' ? (def.slamRadius ?? 50) * 0.8 : reach;
      if (d <= Math.max(reach, slamReach) && a.cooldown <= 0) {
        a.windup = 0;
        steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
      } else if (d > reach * 0.85) {
        steer(v, (dx / d) * speed, (dy / d) * speed, mover.accel, mover.decel, sim.dt);
      } else {
        steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
      }
      continue;
    }

    // Idle: hover around the player on a slot of a slow ring.
    const slot = index.get(e) ?? 0;
    const ang = slot * 2.1 + a.life * 0.012;
    const ring = a.kind === 'colossus' ? 46 : 34;
    const gx = pt.x + Math.cos(ang) * ring - t.x;
    const gy = pt.y + Math.sin(ang) * ring - t.y;
    const gd = Math.hypot(gx, gy);
    if (gd > 12) {
      const k = Math.min(1, gd / 80);
      steer(v, (gx / gd) * speed * k, (gy / gd) * speed * k, mover.accel, mover.decel, sim.dt);
      facing.angle = Math.atan2(gy, gx);
    } else {
      steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
    }
  }
}

/** Passive "Moisson": an enemy dying near the summoner may rise as a wisp. */
export function harvest(sim: Sim, x: number, y: number): void {
  const member = memberOf(sim, 'summoner');
  if (!member || member.ko) return;
  const pt = sim.world.req(sim.player, 'transform');
  const active = sim.world.req(sim.player, 'player').classId === 'summoner';
  if (!active || Math.hypot(x - pt.x, y - pt.y) > SUMMONER.passive.harvestRadius) return;
  const chance = member.flags.has('graveHarvest') ? 1 : SUMMONER.passive.harvestChance;
  if (sim.rng.combat.chance(chance)) summonWisps(sim, x, y, 1);
}
