import { findFreeSpot } from '../../core/tilemap';
import type { BlinkerEnemyDef, BurrowerEnemyDef, HealerEnemyDef } from '../../data/enemies';
import { spawnExplosion, spawnHitbox } from '../../game/factories';
import { applyStatus } from '../statuses';
import {
  angleTo,
  halt,
  moveAway,
  moveToward,
  searchOrIdle,
  setPhase,
  turnTowards,
  type AgentCtx,
} from './context';

function backToHunting(ctx: AgentCtx, cooldown: number): void {
  ctx.ai.cooldown = cooldown;
  setPhase(ctx.ai, ctx.ai.alert ? 'chase' : 'idle');
}

/**
 * Blinker (Spectre errant): a shimmer appears behind the player (channel),
 * then it teleports there and strikes after a short windup. Turning around
 * during the shimmer is the counter.
 */
export function blinkerBehavior(ctx: AgentCtx, def: BlinkerEnemyDef): void {
  const { ai, sim, t } = ctx;
  switch (ai.phase) {
    case 'channel': {
      halt(ctx);
      if (ai.phaseTicks < def.blinkTicks) return;
      const spot = findFreeSpot(sim.map, ai.aimX, ai.aimY, ctx.body.radius, 40);
      if (spot) {
        sim.events.push({ type: 'blink', fromX: t.x, fromY: t.y, toX: spot.x, toY: spot.y });
        t.x = t.prevX = spot.x;
        t.y = t.prevY = spot.y;
      }
      ctx.facing.angle = angleTo(ctx, ctx.px, ctx.py);
      setPhase(ai, 'windup');
      sim.events.push({ type: 'windup', entity: ctx.e });
      return;
    }
    case 'windup':
      halt(ctx);
      turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate * 0.3);
      if (ai.phaseTicks >= def.windupTicks) {
        spawnHitbox(sim, t.x, t.y, {
          owner: ctx.e,
          team: 'enemy',
          shape: { kind: 'circle', radius: def.strike.radius, offset: def.strike.reach },
          angle: ctx.facing.angle,
          damage: Math.round(def.strike.damage * ctx.damageMult),
          knockback: def.strike.knockback,
          stagger: 0,
          delay: 0,
          ticks: 5,
          attached: true,
          canCrit: false,
        });
        setPhase(ai, 'recover');
      }
      return;
    case 'recover':
      halt(ctx);
      if (ai.phaseTicks >= def.recoveryTicks) backToHunting(ctx, def.cooldownTicks);
      return;
    default:
      break;
  }
  if (!ctx.knows) return searchOrIdle(ctx);
  if (ai.phase !== 'chase') setPhase(ai, 'chase');
  turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
  const [near, far] = def.blinkRange;
  if (ai.cooldown <= 0 && ctx.canSee && ctx.dist >= near && ctx.dist <= far) {
    // Behind the player relative to where they're looking.
    const look = sim.world.get(sim.player, 'facing')?.angle ?? 0;
    ai.aimX = ctx.px - Math.cos(look) * def.blinkDistance;
    ai.aimY = ctx.py - Math.sin(look) * def.blinkDistance;
    setPhase(ai, 'channel');
    return;
  }
  // Drifts at mid range, waiting for its moment.
  if (ctx.dist > far * 0.8) moveToward(ctx, ctx.px, ctx.py, 1, true);
  else if (ctx.dist < near) moveAway(ctx, ctx.px, ctx.py, 0.8);
  else halt(ctx);
}

/** Healer (Prêtresse des cendres): keeps away, channels heals and a damage boost on allies. */
export function healerBehavior(ctx: AgentCtx, def: HealerEnemyDef): void {
  const { ai, sim, t } = ctx;
  const w = sim.world;
  switch (ai.phase) {
    case 'channel':
      halt(ctx);
      if (ai.phaseTicks < def.channelTicks) return;
      for (const [e, , et, h] of w.query('enemy', 'transform', 'health')) {
        if (e === ctx.e || h.hp <= 0 || w.isPendingDestroy(e)) continue;
        if (Math.hypot(et.x - t.x, et.y - t.y) > def.healRadius) continue;
        h.hp = Math.min(h.max, h.hp + h.max * def.healFraction);
        applyStatus(sim, e, 'empowered', def.empowerTicks);
      }
      sim.events.push({ type: 'enemyHeal', x: t.x, y: t.y, radius: def.healRadius });
      setPhase(ai, 'recover');
      return;
    case 'recover':
      halt(ctx);
      if (ai.phaseTicks >= def.recoveryTicks) backToHunting(ctx, def.cooldownTicks);
      return;
    default:
      break;
  }
  if (!ctx.knows) return searchOrIdle(ctx);
  if (ai.phase !== 'chase') setPhase(ai, 'chase');
  turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
  const [minR, maxR] = def.preferredRange;
  if (ctx.taunted && ctx.dist > 60) moveToward(ctx, ctx.px, ctx.py, 1, true);
  else if (ctx.dist < minR) moveAway(ctx, ctx.px, ctx.py, 1);
  else if (ctx.dist > maxR || !ctx.canSee) moveToward(ctx, ctx.px, ctx.py, 1, true);
  else halt(ctx);
  // Only bothers channelling when someone around actually needs it.
  if (ai.cooldown > 0) return;
  const hurt = w
    .query('enemy', 'transform', 'health')
    .some(
      ([e, , et, h]) =>
        e !== ctx.e && h.hp < h.max * 0.85 && Math.hypot(et.x - t.x, et.y - t.y) <= def.healRadius,
    );
  if (hurt) {
    setPhase(ai, 'channel');
    sim.events.push({ type: 'windup', entity: ctx.e });
  }
}

/**
 * Burrower (Fouisseur): tunnels towards the player (invulnerable), surfaces
 * under them after a telegraph, then stays exposed — the moment to hit it.
 */
export function burrowerBehavior(ctx: AgentCtx, def: BurrowerEnemyDef): void {
  const { ai, sim, t } = ctx;
  const health = sim.world.req(ctx.e, 'health');
  // Underground it neither blocks nor gets pushed.
  ctx.body.pushable = ai.phase !== 'channel' && ai.phase !== 'windup';
  switch (ai.phase) {
    case 'channel':
      // Underground.
      health.invuln = Math.max(health.invuln, 2);
      if (ctx.knows) moveToward(ctx, ctx.px, ctx.py, def.burrowSpeedMult, true);
      else halt(ctx);
      if ((ctx.knows && ctx.dist < 60) || ai.phaseTicks >= def.burrowTicks) {
        ai.aimX = ctx.knows ? ctx.px : t.x;
        ai.aimY = ctx.knows ? ctx.py : t.y;
        setPhase(ai, 'windup');
        sim.events.push({ type: 'windup', entity: ctx.e });
      }
      return;
    case 'windup':
      health.invuln = Math.max(health.invuln, 2);
      // The mound follows for the first half, then commits.
      if (ctx.knows && ai.phaseTicks < def.emergeTicks * 0.5) {
        ai.aimX = ctx.px;
        ai.aimY = ctx.py;
      }
      moveToward(ctx, ai.aimX, ai.aimY, def.burrowSpeedMult * 0.6, false);
      if (ai.phaseTicks >= def.emergeTicks) {
        spawnExplosion(sim, ctx.e, t.x, t.y, {
          radius: def.emerge.radius,
          damage: Math.round(def.emerge.damage * ctx.damageMult),
          knockback: def.emerge.knockback,
          delayTicks: 0,
          creditPlayer: false,
          team: 'enemy',
        });
        health.invuln = 0;
        setPhase(ai, 'recover');
      }
      return;
    case 'recover':
      // Exposed: dazed on the surface.
      halt(ctx);
      if (ai.phaseTicks >= def.exposedTicks) backToHunting(ctx, def.cooldownTicks);
      return;
    default:
      break;
  }
  if (!ctx.knows) return searchOrIdle(ctx);
  if (ai.phase !== 'chase') setPhase(ai, 'chase');
  turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
  if (ai.cooldown <= 0) {
    setPhase(ai, 'channel');
    sim.events.push({ type: 'burrow', x: t.x, y: t.y });
    return;
  }
  moveToward(ctx, ctx.px, ctx.py, 1, true);
}
