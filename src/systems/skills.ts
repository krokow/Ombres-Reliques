import { CLASSES } from '../data/classes';
import { FEEL } from '../data/combat';
import type { Entity } from '../ecs/world';
import { spawnSmoke } from '../game/factories';
import type { Sim } from '../game/sim';
import { dealDamage } from './damage';
import { applyStatus, hasStatus } from './statuses';

/** Smoke veil (skill key): drops a cloud that makes the player invisible inside it. */
export function playerVeil(sim: Sim): void {
  const w = sim.world;
  const e = sim.player;
  const player = w.req(e, 'player');
  const buffer = w.req(e, 'buffer');
  if (player.skillCooldown > 0) player.skillCooldown--;
  if (buffer.skill <= 0 || player.skillCooldown > 0) return;
  buffer.skill = 0;
  const def = CLASSES[player.classId].veil;
  const t = w.req(e, 'transform');
  spawnSmoke(sim, e, t.x, t.y, def.radius, def.durationTicks);
  player.skillCooldown = def.cooldownTicks;
  sim.events.push({ type: 'veil', x: t.x, y: t.y, radius: def.radius });
}

/** The smoke zone containing (x, y) (within `margin`), if any. */
export function smokeAt(
  sim: Sim,
  x: number,
  y: number,
  margin = 0,
): { x: number; y: number; radius: number } | null {
  for (const [, z, t] of sim.world.query('zone', 'transform')) {
    if (
      z.kind === 'smoke' &&
      z.ticks > 0 &&
      (x - t.x) ** 2 + (y - t.y) ** 2 <= (z.radius + margin) ** 2
    ) {
      return { x: t.x, y: t.y, radius: z.radius };
    }
  }
  return null;
}

/** Zones expire; the player is invisible while inside smoke and gains Ambush when leaving. */
export function updateZones(sim: Sim): void {
  const w = sim.world;
  for (const [e, z] of w.query('zone')) if (--z.ticks <= 0) w.destroy(e);

  const player = w.get(sim.player, 'player');
  const pt = w.get(sim.player, 'transform');
  if (!player || !pt) return;
  const inVeil = sim.playerAlive && smokeAt(sim, pt.x, pt.y) !== null;
  if (inVeil) applyStatus(sim, sim.player, 'invisible', 2);
  if (player.inVeil && !inVeil) {
    applyStatus(sim, sim.player, 'ambush', CLASSES[player.classId].veil.ambushTicks);
    sim.events.push({ type: 'ambush', x: pt.x, y: pt.y });
  }
  player.inVeil = inVeil;
}

/** Targets for Execution: marked enemies first, then the most wounded, all in line of sight. */
export function executionTargets(sim: Sim): Entity[] {
  const w = sim.world;
  const pt = w.req(sim.player, 'transform');
  const def = CLASSES[w.req(sim.player, 'player').classId].ultimate;
  return w
    .query('enemy', 'transform', 'health')
    .filter(
      ([, , t, h]) =>
        h.hp > 0 &&
        Math.hypot(t.x - pt.x, t.y - pt.y) <= def.radius &&
        sim.map.lineOfSight(pt.x, pt.y, t.x, t.y),
    )
    .map(([e, , , h]) => ({ e, marked: hasStatus(w, e, 'mark'), ratio: h.hp / h.max }))
    .sort((a, b) => Number(b.marked) - Number(a.marked) || a.ratio - b.ratio || a.e - b.e)
    .slice(0, def.maxTargets)
    .map((c) => c.e);
}

/** Free spot right behind the target (falls back around it), for the teleport. */
function blinkSpot(sim: Sim, target: Entity): { x: number; y: number } | null {
  const w = sim.world;
  const t = w.req(target, 'transform');
  const facing = w.get(target, 'facing')?.angle ?? 0;
  const pr = w.req(sim.player, 'body').radius;
  const dist = (w.get(target, 'body')?.radius ?? 10) + pr + 4;
  for (let i = 0; i < 8; i++) {
    // Behind first, then alternating sides towards the front.
    const offset = Math.ceil(i / 2) * (Math.PI / 4) * (i % 2 === 0 ? 1 : -1);
    const a = facing + Math.PI + offset;
    const x = t.x + Math.cos(a) * dist;
    const y = t.y + Math.sin(a) * dist;
    if (
      !sim.map.rectOverlapsSolid(x - pr, y - pr, x + pr, y + pr) &&
      sim.map.lineOfSight(t.x, t.y, x, y)
    ) {
      return { x, y };
    }
  }
  return null;
}

/** Execution (ultimate): chained teleport strikes, stronger on wounded targets. */
export function playerUltimate(sim: Sim): void {
  const w = sim.world;
  const e = sim.player;
  const player = w.req(e, 'player');
  const def = CLASSES[player.classId].ultimate;
  const buffer = w.req(e, 'buffer');
  const health = w.req(e, 'health');
  const t = w.req(e, 'transform');

  if (!player.execution) {
    if (buffer.ultimate <= 0) return;
    buffer.ultimate = 0;
    if (player.energy < def.energyCost) {
      sim.events.push({ type: 'ultFail', x: t.x, y: t.y, reason: 'energy' });
      return;
    }
    const targets = executionTargets(sim);
    if (targets.length === 0) {
      sim.events.push({ type: 'ultFail', x: t.x, y: t.y, reason: 'noTarget' });
      return;
    }
    player.energy -= def.energyCost;
    player.execution = { targets, timer: 0 };
    sim.events.push({ type: 'ultStart', x: t.x, y: t.y });
  }

  const ex = player.execution;
  if (!ex) return;
  health.invuln = Math.max(health.invuln, 2);
  const v = w.req(e, 'velocity');
  v.x = 0;
  v.y = 0;
  if (--ex.timer > 0) return;

  let target: Entity | undefined;
  let spot: { x: number; y: number } | null = null;
  while (ex.targets.length > 0 && !spot) {
    target = ex.targets.shift();
    if (target === undefined || !w.isAlive(target) || w.isPendingDestroy(target)) continue;
    spot = blinkSpot(sim, target);
  }
  if (target === undefined || !spot) {
    player.execution = null;
    health.invuln = Math.max(health.invuln, def.endInvulnTicks);
    return;
  }

  sim.events.push({ type: 'blink', fromX: t.x, fromY: t.y, toX: spot.x, toY: spot.y });
  // Teleport: snap prev too so rendering doesn't smear across the room.
  t.x = t.prevX = spot.x;
  t.y = t.prevY = spot.y;
  const tt = w.req(target, 'transform');
  const th = w.req(target, 'health');
  const angle = Math.atan2(tt.y - t.y, tt.x - t.x);
  w.req(e, 'facing').angle = angle;
  const missing = 1 - th.hp / th.max;
  dealDamage(sim, target, {
    amount: def.damage * (1 + def.lowHpBonus * missing),
    source: e,
    byPlayer: true,
    crit: true,
    backstab: true,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    knockback: def.knockback,
    stagger: def.stagger,
    dot: false,
    originX: t.x,
    originY: t.y,
  });
  sim.hitstop(FEEL.hitstop.execution);
  ex.timer = def.hopTicks;
}
