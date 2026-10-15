import { normalize } from '../../core/math';
import type { ArtilleryEnemyDef, ChargerEnemyDef } from '../../data/enemies';
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

/**
 * Charger: approaches, telegraphs a line (tracks, then locks), charges along
 * it; slamming into a wall leaves it stunned — the opening to punish.
 */
export function chargerBehavior(ctx: AgentCtx, def: ChargerEnemyDef): void {
  const { ai, sim, t, v } = ctx;
  switch (ai.phase) {
    case 'windup':
      halt(ctx);
      if (ctx.knows && ai.phaseTicks < def.windupTicks - def.aimLockTicks) {
        ai.aimX = ctx.px;
        ai.aimY = ctx.py;
      }
      turnTowards(ctx, angleTo(ctx, ai.aimX, ai.aimY), def.turnRate * 3);
      if (ai.phaseTicks >= def.windupTicks) {
        setPhase(ai, 'strike');
        spawnHitbox(sim, t.x, t.y, {
          owner: ctx.e,
          team: 'enemy',
          shape: { kind: 'circle', radius: def.charge.radius, offset: 6 },
          angle: ctx.facing.angle,
          damage: Math.round(def.charge.damage * ctx.damageMult),
          knockback: def.charge.knockback,
          stagger: 0,
          delay: 0,
          ticks: def.charge.durationTicks,
          attached: true,
          canCrit: false,
        });
      }
      return;
    case 'strike': {
      const dir = { x: Math.cos(ctx.facing.angle), y: Math.sin(ctx.facing.angle) };
      const r = ctx.body.radius;
      const ahead = sim.map.rectOverlapsSolid(
        t.x + dir.x * 6 - r,
        t.y + dir.y * 6 - r,
        t.x + dir.x * 6 + r,
        t.y + dir.y * 6 + r,
      );
      if (ahead) {
        // Wall hit: stunned, and its charge hitbox fizzles.
        applyStatus(sim, ctx.e, 'stun', def.wallStunTicks);
        for (const [he, hb] of sim.world.query('hitbox'))
          if (hb.owner === ctx.e) sim.world.destroy(he);
        sim.events.push({ type: 'shockwave', x: t.x, y: t.y, radius: r * 2, color: 'gold' });
        v.x = 0;
        v.y = 0;
        setPhase(ai, 'recover');
        return;
      }
      v.x = dir.x * def.charge.speed;
      v.y = dir.y * def.charge.speed;
      if (ai.phaseTicks >= def.charge.durationTicks) setPhase(ai, 'recover');
      return;
    }
    case 'recover':
      halt(ctx);
      if (ai.phaseTicks >= def.recoveryTicks) {
        ai.cooldown = def.cooldownTicks;
        setPhase(ai, ai.alert ? 'chase' : 'idle');
      }
      return;
    default:
      break;
  }
  if (ctx.knows) {
    if (ai.phase !== 'chase') setPhase(ai, 'chase');
    turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
    moveToward(ctx, ctx.px, ctx.py, 1, true);
    if (ai.cooldown <= 0 && ctx.canSee && ctx.dist <= def.chargeRange) {
      setPhase(ai, 'windup');
      ai.aimX = ctx.px;
      ai.aimY = ctx.py;
      sim.events.push({ type: 'windup', entity: ctx.e });
    }
    return;
  }
  searchOrIdle(ctx);
}

/** Artillery: keeps its distance, lobs telegraphed shells at (and around) the player. */
export function artilleryBehavior(ctx: AgentCtx, def: ArtilleryEnemyDef): void {
  const { ai, sim, t } = ctx;
  const [minRange, maxRange] = def.preferredRange;
  switch (ai.phase) {
    case 'windup':
      halt(ctx);
      if (ctx.knows) {
        ai.aimX = ctx.px;
        ai.aimY = ctx.py;
      }
      turnTowards(ctx, angleTo(ctx, ai.aimX, ai.aimY), def.turnRate * 2);
      if (ai.phaseTicks >= def.windupTicks) {
        for (let i = 0; i < def.shells; i++) {
          const a = sim.rng.ai.range(-Math.PI, Math.PI);
          const d = i === 0 ? 0 : sim.rng.ai.range(def.scatter * 0.4, def.scatter);
          const x = ai.aimX + Math.cos(a) * d;
          const y = ai.aimY + Math.sin(a) * d;
          if (sim.map.isSolidAt(x, y)) continue;
          spawnExplosion(sim, ctx.e, x, y, {
            radius: def.shell.radius,
            damage: Math.round(def.shell.damage * ctx.damageMult),
            knockback: def.shell.knockback,
            delayTicks: def.shell.delayTicks + i * 6,
            creditPlayer: false,
            team: 'enemy',
          });
        }
        const angle = angleTo(ctx, ai.aimX, ai.aimY);
        sim.events.push({ type: 'enemyShoot', x: t.x, y: t.y, angle });
        setPhase(ai, 'recover');
      }
      return;
    case 'recover':
      halt(ctx);
      if (ai.phaseTicks >= def.recoveryTicks) {
        ai.cooldown = def.cooldownTicks;
        setPhase(ai, ai.alert ? 'chase' : 'idle');
      }
      return;
    default:
      break;
  }
  if (ctx.knows) {
    if (ai.phase !== 'chase') setPhase(ai, 'chase');
    turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
    if (ctx.taunted) {
      const d = normalize(ctx.px - t.x, ctx.py - t.y);
      if (ctx.dist > 60) moveToward(ctx, ctx.px - d.x * 40, ctx.py - d.y * 40, 1, true);
      else halt(ctx);
    } else if (!ctx.canSee || ctx.dist > maxRange) moveToward(ctx, ctx.px, ctx.py, 1, true);
    else if (ctx.dist < minRange) moveAway(ctx, ctx.px, ctx.py, 1);
    else halt(ctx);
    if (ai.cooldown <= 0 && ctx.dist <= maxRange * 1.2) {
      setPhase(ai, 'windup');
      sim.events.push({ type: 'windup', entity: ctx.e });
    }
    return;
  }
  searchOrIdle(ctx);
}
