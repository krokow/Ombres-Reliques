import { GUARDIAN as DEF } from '../../data/classes';
import { FEEL } from '../../data/combat';
import { spawnHitbox } from '../../game/factories';
import type { InputFrame } from '../../game/inputFrame';
import type { Sim } from '../../game/sim';
import { dealDamage, playerBlast } from '../damage';
import { activeMods, hasFlag, scaledCooldown } from '../progression';
import {
  cancelCombo,
  enemiesAround,
  isAttacking,
  runCombo,
  trySpendUltimate,
  tryStartDash,
  updateDashMotion,
} from '../player';
import { applyStatus } from '../statuses';
import type { Kit } from './kit';

export function addShield(sim: Sim, amount: number): void {
  const h = sim.world.req(sim.player, 'health');
  h.shield = Math.min(DEF.shieldCap + activeMods(sim).shieldCapBonus, h.shield + amount);
}

/** Radial blast used by the switch-in and the ultimate. */
function shockwave(
  sim: Sim,
  radius: number,
  damage: number,
  knockback: number,
  stagger: number,
  stunTicks: number,
): void {
  const t = sim.world.req(sim.player, 'transform');
  for (const e of enemiesAround(sim, t.x, t.y, radius)) {
    const et = sim.world.req(e, 'transform');
    const a = Math.atan2(et.y - t.y, et.x - t.x);
    if (stunTicks > 0) applyStatus(sim, e, 'stun', stunTicks, sim.player);
    dealDamage(sim, e, {
      amount: damage,
      source: sim.player,
      byPlayer: true,
      crit: false,
      backstab: false,
      dirX: Math.cos(a),
      dirY: Math.sin(a),
      knockback,
      stagger,
      dot: false,
      originX: t.x,
      originY: t.y,
    });
  }
  sim.events.push({ type: 'shockwave', x: t.x, y: t.y, radius, color: 'gold' });
}

/** Shield raised with the secondary button; blockTicks drives the parry window. */
function updateBlock(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const canBlock = input.secondaryHeld && w.req(sim.player, 'dash').active === 0;
  if (!canBlock) {
    p.blockTicks = -1;
    return;
  }
  if (p.blockTicks < 0) {
    // Raising the shield interrupts a swing: defence first.
    if (isAttacking(sim)) cancelCombo(sim, DEF.combo.length);
    p.blockTicks = 0;
  } else {
    p.blockTicks++;
  }
}

function charge(sim: Sim, input: InputFrame): void {
  if (!tryStartDash(sim, input)) return;
  sim.world.req(sim.player, 'player').blockTicks = -1;
  const t = sim.world.req(sim.player, 'transform');
  const dash = sim.world.req(sim.player, 'dash');
  spawnHitbox(sim, t.x, t.y, {
    owner: sim.player,
    team: 'player',
    shape: { kind: 'circle', radius: DEF.charge.radius, offset: 10 },
    angle: Math.atan2(dash.dirY, dash.dirX),
    damage: DEF.charge.damage,
    knockback: DEF.charge.knockback,
    stagger: DEF.charge.stagger,
    delay: 0,
    ticks: DEF.dash.durationTicks,
    attached: true,
    canCrit: true,
    sourceClass: 'guardian',
  });
}

function taunt(sim: Sim): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.skill <= 0 || p.skillCooldown > 0) return;
  buffer.skill = 0;
  p.skillCooldown = scaledCooldown(sim, DEF.taunt.cooldownTicks, 'skill');
  const t = w.req(sim.player, 'transform');
  for (const [e, , et] of w.query('enemy', 'transform')) {
    if (Math.hypot(et.x - t.x, et.y - t.y) <= DEF.taunt.radius)
      applyStatus(sim, e, 'taunted', DEF.taunt.ticks, sim.player);
  }
  addShield(sim, DEF.taunt.shield + activeMods(sim).tauntShieldBonus);
  sim.events.push({ type: 'taunt', x: t.x, y: t.y, radius: DEF.taunt.radius });
}

function bastion(sim: Sim): void {
  if (!trySpendUltimate(sim, DEF.ultimate.energyCost)) return;
  const u = DEF.ultimate;
  shockwave(sim, u.radius, u.damage, u.knockback, 30, u.stunTicks);
  addShield(sim, u.shield);
  // Talent "Ralliement": Bastion also heals the reserve.
  if (hasFlag(sim, 'rally')) {
    const party = sim.world.req(sim.player, 'party');
    party.members.forEach((m, i) => {
      if (i !== party.active && !m.ko)
        m.health.hp = Math.min(m.health.max, m.health.hp + m.health.max * 0.25);
    });
  }
  sim.hitstop(FEEL.hitstop.execution);
  const t = sim.world.req(sim.player, 'transform');
  sim.events.push({ type: 'ultStart', x: t.x, y: t.y });
}

/** Passive: the shield slowly rebuilds out of combat. */
function regenShield(sim: Sim): void {
  const h = sim.world.req(sim.player, 'health');
  const cap = DEF.passive.regenCap + activeMods(sim).regenCapBonus;
  if (h.sinceHit >= DEF.passive.regenDelayTicks && h.shield < cap) {
    h.shield = Math.min(cap, h.shield + DEF.passive.regenPerSecond * sim.dt);
  }
}

export const guardianKit: Kit = {
  update(sim: Sim, input: InputFrame): void {
    regenShield(sim);
    const dash = sim.world.req(sim.player, 'dash');
    const wasCharging = dash.active > 0;
    const charging = updateDashMotion(sim);
    // Evolution "Séisme": the charge ends in a shockwave.
    if (wasCharging && dash.active === 0 && hasFlag(sim, 'earthshaker')) {
      const t = sim.world.req(sim.player, 'transform');
      for (const e of enemiesAround(sim, t.x, t.y, 90)) applyStatus(sim, e, 'stun', 40, sim.player);
      playerBlast(sim, 90, 14, 300, 20);
    }
    if (charging) return;
    updateBlock(sim, input);
    charge(sim, input);
    const blocking = sim.world.req(sim.player, 'player').blockTicks >= 0;
    if (!blocking) runCombo(sim, DEF.combo, DEF.comboResetTicks);
    taunt(sim);
    bastion(sim);
  },
  busy: () => false,
  updateBusy: () => undefined,
  moveFactor(sim) {
    if (sim.world.req(sim.player, 'player').blockTicks >= 0) return DEF.block.moveFactor;
    return isAttacking(sim) ? DEF.attackMoveFactor : 1;
  },
  /** Switch-in: lands with a shockwave and a small shield. */
  entry(sim: Sim): void {
    const e = DEF.entry;
    shockwave(sim, e.radius, e.damage, e.knockback, e.stagger, 0);
    addShield(sim, e.shield);
  },
  hud(sim) {
    const p = sim.world.req(sim.player, 'player');
    const dash = sim.world.req(sim.player, 'dash');
    return [
      {
        key: 'dash',
        label: DEF.labels.mobility,
        fill: dash.charges > 0 ? 1 : dash.recharge / DEF.dash.rechargeTicks,
        ready: dash.charges > 0,
        color: '#ffcf5a',
      },
      {
        key: 'ranged',
        label: DEF.labels.secondary,
        fill: 1,
        ready: p.blockTicks < 0,
        color: '#9fb4c8',
      },
      {
        key: 'skill',
        label: DEF.labels.skill,
        fill: 1 - p.skillCooldown / DEF.taunt.cooldownTicks,
        ready: p.skillCooldown <= 0,
        color: '#ffcf5a',
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
