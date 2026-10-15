import { angleDiff, clamp, normalize, type Vec2 } from '../core/math';
import { ENEMIES } from '../data/enemies';
import { spawnHitbox } from '../game/factories';
import type { Sim } from '../game/sim';
import { steer } from './movement';

function turnTowards(current: number, target: number, maxDelta: number): number {
  return current + clamp(angleDiff(current, target), -maxDelta, maxDelta);
}

/**
 * Straight at the target when the whole body has a clear line (checked from
 * both sides of the body), otherwise follow the shared flow field.
 */
function chaseDirection(
  sim: Sim,
  x: number,
  y: number,
  tx: number,
  ty: number,
  radius: number,
): Vec2 {
  const direct = normalize(tx - x, ty - y);
  const ox = -direct.y * radius;
  const oy = direct.x * radius;
  const { map } = sim;
  if (
    map.lineOfSight(x + ox, y + oy, tx + ox, ty + oy) &&
    map.lineOfSight(x - ox, y - oy, tx - ox, ty - oy)
  ) {
    return direct;
  }
  const s = map.tileSize;
  const next = sim.nav.nextTile(Math.floor(x / s), Math.floor(y / s));
  if (!next) return direct;
  const c = map.tileCenter(next.tx, next.ty);
  return normalize(c.x - x, c.y - y);
}

/**
 * M1 melee AI as a small state machine: chase → windup (telegraphed, turns
 * slowly so it can be outflanked) → strike → recover. Pathfinding comes in M2.
 */
export function enemyAI(sim: Sim, playerAlive: boolean): void {
  const w = sim.world;
  const pt = w.get(sim.player, 'transform');
  const pBody = w.get(sim.player, 'body');

  for (const [e, ai, t, v, facing, health, mover] of w.query(
    'enemy',
    'transform',
    'velocity',
    'facing',
    'health',
    'mover',
  )) {
    const def = ENEMIES[ai.defId];
    if (ai.cooldown > 0) ai.cooldown--;

    if (health.stagger > 0) {
      health.stagger--;
      steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
      if (ai.phase === 'windup') {
        ai.phase = 'recover';
        ai.phaseTicks = 0;
      }
      continue;
    }

    if (!pt || !playerAlive) {
      steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
      continue;
    }

    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    ai.phaseTicks++;

    switch (ai.phase) {
      case 'chase': {
        facing.angle = turnTowards(facing.angle, toPlayer, def.turnRate * sim.dt);
        const radius = w.req(e, 'body').radius;
        const gap = dist - radius - (pBody?.radius ?? 0);
        // Don't shove the player around while waiting for the attack cooldown.
        const speed = ai.cooldown > 0 && gap <= def.holdDistance ? 0 : mover.moveSpeed;
        const dir = chaseDirection(sim, t.x, t.y, pt.x, pt.y, radius);
        steer(v, dir.x * speed, dir.y * speed, mover.accel, mover.decel, sim.dt);
        if (ai.cooldown <= 0 && dist <= def.attackRange + (pBody?.radius ?? 0)) {
          ai.phase = 'windup';
          ai.phaseTicks = 0;
          sim.events.push({ type: 'windup', entity: e });
        }
        break;
      }
      case 'windup': {
        // Committed: barely tracks the player, which is what makes it dodgeable.
        facing.angle = turnTowards(facing.angle, toPlayer, def.turnRate * 0.2 * sim.dt);
        steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
        if (ai.phaseTicks >= def.windupTicks) {
          ai.phase = 'strike';
          ai.phaseTicks = 0;
          spawnHitbox(sim, t.x, t.y, {
            owner: e,
            team: 'enemy',
            shape: { kind: 'circle', radius: def.strike.radius, offset: def.strike.reach },
            angle: facing.angle,
            damage: def.strike.damage,
            knockback: def.strike.knockback,
            stagger: 0,
            delay: 0,
            ticks: def.strike.activeTicks,
            attached: true,
            canCrit: false,
          });
          const imp = w.req(e, 'impulse');
          imp.x += Math.cos(facing.angle) * def.strike.lunge;
          imp.y += Math.sin(facing.angle) * def.strike.lunge;
        }
        break;
      }
      case 'strike':
        steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
        if (ai.phaseTicks >= def.strike.activeTicks) {
          ai.phase = 'recover';
          ai.phaseTicks = 0;
        }
        break;
      case 'recover':
        steer(v, 0, 0, mover.accel, mover.decel, sim.dt);
        if (ai.phaseTicks >= def.recoveryTicks) {
          ai.phase = 'chase';
          ai.phaseTicks = 0;
          ai.cooldown = def.cooldownTicks;
        }
        break;
    }
  }
}
