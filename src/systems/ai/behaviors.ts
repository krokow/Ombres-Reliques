import { AI } from '../../data/combat';
import {
  isEnemyId,
  type KamikazeEnemyDef,
  type MeleeEnemyDef,
  type RangedEnemyDef,
  type SummonerEnemyDef,
} from '../../data/enemies';
import {
  spawnEnemy,
  spawnEnemyProjectile,
  spawnExplosion,
  spawnHitbox,
} from '../../game/factories';
import {
  angleTo,
  blindPursuit,
  distTo,
  halt,
  moveAway,
  moveToward,
  searchOrIdle,
  setPhase,
  turnTowards,
  type AgentCtx,
} from './context';

function startAttack(
  ctx: AgentCtx,
  phase: 'windup' | 'fuse' | 'channel',
  x: number,
  y: number,
  blind: boolean,
): void {
  const { ai } = ctx;
  setPhase(ai, phase);
  ai.aimX = x;
  ai.aimY = y;
  ai.blind = blind;
  ctx.sim.events.push({ type: 'windup', entity: ctx.e });
}

/** Ends recovery: back to hunting, with a longer cooldown after a blind strike. */
function endRecovery(ctx: AgentCtx, cooldownTicks: number): void {
  const { ai } = ctx;
  ai.cooldown = Math.round(cooldownTicks * (ai.blind ? AI.blindCooldownMult : 1));
  ai.blind = false;
  setPhase(ai, ai.alert ? 'chase' : 'idle');
}

/** Taunted ranged enemies abandon their distance and walk up to the Guardian. */
function approachWhenTaunted(ctx: AgentCtx): void {
  if (ctx.dist > ctx.body.radius + ctx.playerRadius + 24) moveToward(ctx, ctx.px, ctx.py, 1, true);
  else halt(ctx);
}

/** Chase → telegraphed windup (barely tracks: can be outflanked) → strike → recover. */
export function meleeBehavior(ctx: AgentCtx, def: MeleeEnemyDef): void {
  const { ai, sim, t } = ctx;
  switch (ai.phase) {
    case 'windup':
      halt(ctx);
      if (!ai.blind && ctx.knows)
        turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate * 0.2);
      else turnTowards(ctx, angleTo(ctx, ai.aimX, ai.aimY), def.turnRate);
      if (ai.phaseTicks >= def.windupTicks) {
        setPhase(ai, 'strike');
        spawnHitbox(sim, t.x, t.y, {
          owner: ctx.e,
          team: 'enemy',
          shape: { kind: 'circle', radius: def.strike.radius, offset: def.strike.reach },
          angle: ctx.facing.angle,
          damage: Math.round(def.strike.damage * ctx.damageMult),
          knockback: def.strike.knockback,
          stagger: 0,
          delay: 0,
          ticks: def.strike.activeTicks,
          attached: true,
          canCrit: false,
        });
        const imp = sim.world.req(ctx.e, 'impulse');
        imp.x += Math.cos(ctx.facing.angle) * def.strike.lunge;
        imp.y += Math.sin(ctx.facing.angle) * def.strike.lunge;
      }
      return;
    case 'strike':
      halt(ctx);
      if (ai.phaseTicks >= def.strike.activeTicks) setPhase(ai, 'recover');
      return;
    case 'recover':
      halt(ctx);
      if (ai.phaseTicks >= def.recoveryTicks) endRecovery(ctx, def.cooldownTicks);
      return;
    default:
      break;
  }

  if (ctx.knows) {
    ai.blind = false;
    if (ai.phase !== 'chase') setPhase(ai, 'chase');
    turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
    const gap = ctx.dist - ctx.body.radius - ctx.playerRadius;
    // Don't shove the player around while waiting for the attack cooldown.
    const hold = ai.cooldown > 0 && gap <= def.holdDistance;
    if (hold) halt(ctx);
    else moveToward(ctx, ctx.px, ctx.py, 1, true);
    if (ai.cooldown <= 0 && ctx.dist <= def.attackRange + ctx.playerRadius) {
      startAttack(ctx, 'windup', ctx.px, ctx.py, false);
    }
    return;
  }
  if (ctx.veil) {
    blindPursuit(ctx, def.attackRange, false, () =>
      startAttack(ctx, 'windup', ai.aimX, ai.aimY, true),
    );
    return;
  }
  searchOrIdle(ctx);
}

/** Keeps its preferred distance, aims (tracking then locked), fires a slowing bolt. */
export function rangedBehavior(ctx: AgentCtx, def: RangedEnemyDef): void {
  const { ai, sim, t } = ctx;
  const [minRange, maxRange] = def.preferredRange;
  switch (ai.phase) {
    case 'windup':
      halt(ctx);
      if (!ai.blind && ctx.knows && ai.phaseTicks < def.windupTicks - def.aimLockTicks) {
        ai.aimX = ctx.px;
        ai.aimY = ctx.py;
      }
      turnTowards(ctx, angleTo(ctx, ai.aimX, ai.aimY), def.turnRate * 2);
      if (ai.phaseTicks >= def.windupTicks) {
        const angle = angleTo(ctx, ai.aimX, ai.aimY);
        const x = t.x + Math.cos(angle) * ctx.body.radius;
        const y = t.y + Math.sin(angle) * ctx.body.radius;
        spawnEnemyProjectile(sim, ctx.e, x, y, angle, def.projectile, ctx.damageMult);
        sim.events.push({ type: 'enemyShoot', x, y, angle });
        setPhase(ai, 'recover');
      }
      return;
    case 'recover':
      halt(ctx);
      if (ai.phaseTicks >= def.recoveryTicks) endRecovery(ctx, def.cooldownTicks);
      return;
    default:
      break;
  }

  if (ctx.knows) {
    ai.blind = false;
    if (ai.phase !== 'chase') setPhase(ai, 'chase');
    turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
    if (ctx.taunted) approachWhenTaunted(ctx);
    else if (!ctx.canSee || ctx.dist > maxRange) moveToward(ctx, ctx.px, ctx.py, 1, true);
    else if (ctx.dist < minRange) moveAway(ctx, ctx.px, ctx.py, 1);
    else halt(ctx);
    if (ai.cooldown <= 0 && ctx.canSee && ctx.dist <= maxRange * 1.15) {
      startAttack(ctx, 'windup', ctx.px, ctx.py, false);
    }
    return;
  }
  if (ctx.veil) {
    blindPursuit(ctx, maxRange, true, () => startAttack(ctx, 'windup', ai.aimX, ai.aimY, true));
    return;
  }
  searchOrIdle(ctx);
}

/** Rushes in, lights a fuse (keeps creeping), explodes on everyone around. */
export function kamikazeBehavior(ctx: AgentCtx, def: KamikazeEnemyDef): void {
  const { ai, sim, t } = ctx;
  if (ai.phase === 'fuse') {
    if (ctx.knows && !ai.blind) {
      ai.aimX = ctx.px;
      ai.aimY = ctx.py;
    }
    if (ctx.staggered) halt(ctx);
    else moveToward(ctx, ai.aimX, ai.aimY, def.fuseMoveFactor, ctx.knows && !ai.blind);
    if (ai.phaseTicks >= def.fuseTicks) {
      spawnExplosion(sim, ctx.e, t.x, t.y, {
        radius: def.explosion.radius,
        damage: Math.round(def.explosion.damage * ctx.damageMult),
        knockback: def.explosion.knockback,
        delayTicks: 0,
        poisonTicks: def.explosion.poisonTicks,
        creditPlayer: false,
      });
      sim.world.destroy(ctx.e);
    }
    return;
  }
  if (ctx.staggered) {
    halt(ctx);
    return;
  }
  if (ctx.knows) {
    if (ai.phase !== 'chase') setPhase(ai, 'chase');
    turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
    moveToward(ctx, ctx.px, ctx.py, 1, true);
    if (ctx.dist <= def.triggerRange + ctx.playerRadius)
      startAttack(ctx, 'fuse', ctx.px, ctx.py, false);
    return;
  }
  if (ctx.veil) {
    blindPursuit(ctx, def.triggerRange, false, () =>
      startAttack(ctx, 'fuse', ai.aimX, ai.aimY, true),
    );
    return;
  }
  searchOrIdle(ctx);
}

/** Keeps away and channels to raise minions (interruptible by staggering hits). */
export function summonerBehavior(ctx: AgentCtx, def: SummonerEnemyDef): void {
  const { ai, sim, t } = ctx;
  const [minRange, maxRange] = def.preferredRange;
  switch (ai.phase) {
    case 'channel':
      halt(ctx);
      if (ai.phaseTicks >= def.channelTicks && isEnemyId(def.summonId)) {
        const summonId = def.summonId;
        for (let i = 0; i < def.summonCount; i++) {
          const a = ctx.facing.angle + ((i + 0.5) / def.summonCount - 0.5) * Math.PI + Math.PI / 2;
          let x = t.x + Math.cos(a) * 28;
          let y = t.y + Math.sin(a) * 28;
          if (sim.map.isSolidAt(x, y)) {
            x = t.x;
            y = t.y;
          }
          spawnEnemy(sim, summonId, x, y, { summoner: ctx.e });
          sim.events.push({ type: 'summon', x, y });
        }
        setPhase(ai, 'recover');
      }
      return;
    case 'recover':
      halt(ctx);
      if (ai.phaseTicks >= def.recoveryTicks) endRecovery(ctx, def.cooldownTicks);
      return;
    default:
      break;
  }

  const minions = sim.world.query('minion').filter(([, m]) => m.summoner === ctx.e).length;
  const canSummon = ai.cooldown <= 0 && minions < def.maxMinions;
  if (ctx.knows) {
    if (ai.phase !== 'chase') setPhase(ai, 'chase');
    turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
    if (ctx.taunted) approachWhenTaunted(ctx);
    else if (!ctx.canSee || ctx.dist > maxRange) moveToward(ctx, ctx.px, ctx.py, 1, true);
    else if (ctx.dist < minRange) moveAway(ctx, ctx.px, ctx.py, 1);
    else halt(ctx);
    if (canSummon && ctx.dist <= maxRange * 1.2) startAttack(ctx, 'channel', ctx.px, ctx.py, false);
    return;
  }
  if (ai.alert && canSummon && distTo(ctx, ai.lastKnownX, ai.lastKnownY) <= maxRange) {
    startAttack(ctx, 'channel', ai.lastKnownX, ai.lastKnownY, false);
    return;
  }
  searchOrIdle(ctx);
}
