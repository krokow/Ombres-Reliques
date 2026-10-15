import { SHADOW_BLADE as DEF } from '../../data/classes';
import { FEEL } from '../../data/combat';
import type { Entity } from '../../ecs/world';
import { spawnHitbox, spawnShuriken, spawnSmoke } from '../../game/factories';
import type { InputFrame } from '../../game/inputFrame';
import type { Sim } from '../../game/sim';
import { dealDamage } from '../damage';
import { isAttacking, runCombo, tryStartDash, updateDashMotion } from '../player';
import { applyStatus, hasStatus } from '../statuses';
import {
  activeMember,
  activeMods,
  dashRechargeTicks,
  hasFlag,
  maxDashCharges,
  scaledCooldown,
} from '../progression';
import type { Kit } from './kit';

/** Targets for Execution: marked enemies first, then the most wounded, all in line of sight. */
export function executionTargets(sim: Sim): Entity[] {
  const w = sim.world;
  const pt = w.req(sim.player, 'transform');
  const def = DEF.ultimate;
  return w
    .query('enemy', 'transform', 'health')
    .filter(
      ([e, , t, h]) =>
        h.hp > 0 &&
        !w.isPendingDestroy(e) &&
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

function shuriken(sim: Sim): void {
  const w = sim.world;
  const e = sim.player;
  const player = w.req(e, 'player');
  const buffer = w.req(e, 'buffer');
  if (buffer.ranged <= 0 || player.rangedCooldown > 0 || w.req(e, 'dash').active > 0) return;
  buffer.ranged = 0;
  player.rangedCooldown = scaledCooldown(sim, DEF.ranged.cooldownTicks);
  const t = w.req(e, 'transform');
  const aim = w.req(e, 'facing').angle;
  const x = t.x + Math.cos(aim) * DEF.radius;
  const y = t.y + Math.sin(aim) * DEF.radius;
  // Card "Éventail": three shurikens in a fan.
  const angles = hasFlag(sim, 'shurikenFan') ? [aim - 0.22, aim, aim + 0.22] : [aim];
  for (const angle of angles) spawnShuriken(sim, e, x, y, angle);
  sim.events.push({ type: 'throw', x, y, angle: aim });
}

/** Smoke veil: a cloud that makes the player invisible inside it (see zones.ts). */
function veil(sim: Sim): void {
  const w = sim.world;
  const e = sim.player;
  const player = w.req(e, 'player');
  const buffer = w.req(e, 'buffer');
  if (buffer.skill <= 0 || player.skillCooldown > 0) return;
  buffer.skill = 0;
  const t = w.req(e, 'transform');
  const duration = Math.round(DEF.veil.durationTicks * (1 + activeMods(sim).veilDurationPct));
  spawnSmoke(sim, e, t.x, t.y, DEF.veil.radius, duration);
  player.skillCooldown = scaledCooldown(sim, DEF.veil.cooldownTicks, 'skill');
  sim.events.push({ type: 'veil', x: t.x, y: t.y, radius: DEF.veil.radius });
}

function startExecution(sim: Sim): void {
  const w = sim.world;
  const player = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.ultimate <= 0) return;
  buffer.ultimate = 0;
  const t = w.req(sim.player, 'transform');
  if (player.energy < DEF.ultimate.energyCost) {
    sim.events.push({ type: 'ultFail', x: t.x, y: t.y, reason: 'energy' });
    return;
  }
  const targets = executionTargets(sim);
  if (targets.length === 0) {
    sim.events.push({ type: 'ultFail', x: t.x, y: t.y, reason: 'noTarget' });
    return;
  }
  player.energy -= DEF.ultimate.energyCost;
  player.execution = { targets, timer: 0 };
  sim.events.push({ type: 'ultStart', x: t.x, y: t.y });
  executionStep(sim);
}

/** Execution: chained teleport strikes, stronger on wounded targets. */
function executionStep(sim: Sim): void {
  const w = sim.world;
  const e = sim.player;
  const player = w.req(e, 'player');
  const def = DEF.ultimate;
  const ex = player.execution;
  if (!ex) return;
  const health = w.req(e, 'health');
  const t = w.req(e, 'transform');
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
    // Talent "Marque de mort" doubles the wounded-target bonus.
    amount: def.damage * (1 + def.lowHpBonus * (hasFlag(sim, 'deathMark') ? 2 : 1) * missing),
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

/** Evolution "Danse des lames": the dash leaves a damaging trail. */
function bladeDanceTrail(sim: Sim): void {
  const dash = sim.world.req(sim.player, 'dash');
  if (!hasFlag(sim, 'bladeDance') || dash.active % 2 !== 0) return;
  const t = sim.world.req(sim.player, 'transform');
  spawnHitbox(sim, t.x, t.y, {
    owner: sim.player,
    team: 'player',
    shape: { kind: 'circle', radius: 16, offset: 0 },
    angle: Math.atan2(dash.dirY, dash.dirX),
    damage: 7,
    knockback: 60,
    stagger: 8,
    delay: 0,
    ticks: 24,
    attached: false,
    canCrit: false,
    sourceClass: 'shadowBlade',
  });
  sim.events.push({ type: 'trail', x: t.x, y: t.y });
}

export const shadowBladeKit: Kit = {
  update(sim: Sim, input: InputFrame): void {
    if (updateDashMotion(sim)) bladeDanceTrail(sim);
    else tryStartDash(sim, input);
    // Card "Brume tenace": the veil also heals.
    const p = sim.world.req(sim.player, 'player');
    if (p.inVeil && hasFlag(sim, 'lingeringVeil')) {
      const h = sim.world.req(sim.player, 'health');
      h.hp = Math.min(h.max, h.hp + 3 * sim.dt);
    }
    runCombo(sim, DEF.combo, DEF.comboResetTicks);
    shuriken(sim);
    veil(sim);
    startExecution(sim);
  },
  busy: (sim) => sim.world.req(sim.player, 'player').execution !== null,
  updateBusy: (sim) => executionStep(sim),
  moveFactor: (sim) => (isAttacking(sim) ? DEF.attackMoveFactor : 1),
  /** Switch-in: arrives unseen, and the first strike is a guaranteed crit. */
  entry(sim: Sim): void {
    applyStatus(sim, sim.player, 'invisible', DEF.entry.invisibleTicks);
    applyStatus(sim, sim.player, 'ambush', DEF.entry.ambushTicks);
    const t = sim.world.req(sim.player, 'transform');
    sim.events.push({ type: 'veil', x: t.x, y: t.y, radius: 30 });
  },
  hud(sim) {
    const p = sim.world.req(sim.player, 'player');
    const dash = sim.world.req(sim.player, 'dash');
    const member = activeMember(sim);
    const maxCharges = member ? maxDashCharges(member) : DEF.dash.maxCharges;
    const recharge = member ? dashRechargeTicks(member) : DEF.dash.rechargeTicks;
    return [
      {
        key: 'dash',
        label: DEF.labels.mobility,
        fill: dash.charges >= maxCharges ? 1 : dash.recharge / recharge,
        ready: dash.charges > 0,
        color: '#7ff6ff',
        count: `${dash.charges}`,
      },
      {
        key: 'ranged',
        label: DEF.labels.secondary,
        fill: 1 - p.rangedCooldown / DEF.ranged.cooldownTicks,
        ready: p.rangedCooldown <= 0,
        color: '#cfd6ff',
      },
      {
        key: 'skill',
        label: DEF.labels.skill,
        fill: 1 - p.skillCooldown / DEF.veil.cooldownTicks,
        ready: p.skillCooldown <= 0,
        color: '#8f86b8',
      },
      {
        key: 'ultimate',
        label: DEF.labels.ultimate,
        fill: p.energy / DEF.ultimate.energyCost,
        ready: p.energy >= DEF.ultimate.energyCost,
        color: '#ffd34d',
      },
    ];
  },
};
