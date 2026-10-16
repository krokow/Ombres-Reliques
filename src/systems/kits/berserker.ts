import { BERSERKER as DEF } from '../../data/classes';
import { spawnHitbox, spawnPlayerProjectile } from '../../game/factories';
import type { InputFrame } from '../../game/inputFrame';
import type { Sim } from '../../game/sim';
import { playerBlast } from '../damage';
import {
  enemiesAround,
  isAttacking,
  runCombo,
  trySpendUltimate,
  tryStartDash,
  updateDashMotion,
} from '../player';
import { hasFlag, scaledCooldown } from '../progression';
import { gainRage } from '../rage';
import { applyStatus } from '../statuses';
import type { Kit } from './kit';

/** Secondary: thrown axe (two in a V with "Haches jumelles"). */
function throwAxe(sim: Sim): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.ranged <= 0 || p.rangedCooldown > 0) return;
  buffer.ranged = 0;
  const a = DEF.axe;
  p.rangedCooldown = scaledCooldown(sim, a.cooldownTicks);
  const t = w.req(sim.player, 'transform');
  const facing = w.req(sim.player, 'facing').angle;
  const angles = hasFlag(sim, 'twinAxes') ? [facing - 0.18, facing + 0.18] : [facing];
  for (const angle of angles) {
    spawnPlayerProjectile(sim, sim.player, t.x, t.y, angle, {
      ...a,
      kind: 'axe',
      statuses: [{ id: 'slow', ticks: a.slowTicks }],
    });
  }
  sim.events.push({ type: 'cast', x: t.x, y: t.y, angle: facing, spell: 'axe' });
}

/** Landing of the leap: crash, plus a stun with "Impact". */
function land(sim: Sim): void {
  const l = DEF.leap;
  const t = sim.world.req(sim.player, 'transform');
  if (hasFlag(sim, 'leapStun')) {
    for (const e of enemiesAround(sim, t.x, t.y, l.radius))
      applyStatus(sim, e, 'stun', l.stunTicks, sim.player);
  }
  playerBlast(sim, l.radius, l.damage, l.knockback, l.stagger, 'blood');
}

/** Skill: whirlwind, paid in HP; with "Maelström" it lasts longer and pulls enemies in. */
function startSpin(sim: Sim): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.skill <= 0 || p.skillCooldown > 0 || p.spin > 0) return;
  buffer.skill = 0;
  p.skillCooldown = scaledCooldown(sim, DEF.spin.cooldownTicks, 'skill');
  const h = w.req(sim.player, 'health');
  h.hp = Math.max(1, h.hp - Math.round(h.max * DEF.spin.hpCostFraction));
  const long = hasFlag(sim, 'maelstrom') ? 1.5 : 1;
  p.spin = Math.round(DEF.spin.durationTicks * long);
  gainRage(sim, 15);
}

function updateSpin(sim: Sim): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  if (p.spin <= 0) return;
  p.spin--;
  const s = DEF.spin;
  const t = w.req(sim.player, 'transform');
  if (hasFlag(sim, 'maelstrom')) {
    for (const e of enemiesAround(sim, t.x, t.y, s.radius * 2.2)) {
      if (w.has(e, 'boss')) continue;
      const et = w.req(e, 'transform');
      const imp = w.req(e, 'impulse');
      const d = Math.hypot(t.x - et.x, t.y - et.y) || 1;
      imp.x += ((t.x - et.x) / d) * 40;
      imp.y += ((t.y - et.y) / d) * 40;
    }
  }
  if (p.spin % s.intervalTicks !== 0) return;
  spawnHitbox(sim, t.x, t.y, {
    owner: sim.player,
    team: 'player',
    shape: { kind: 'circle', radius: s.radius, offset: 0 },
    angle: 0,
    damage: s.damage,
    knockback: s.knockback,
    stagger: 6,
    delay: 0,
    ticks: 3,
    attached: true,
    canCrit: true,
    sourceClass: 'berserker',
  });
  sim.events.push({ type: 'spin', x: t.x, y: t.y, radius: s.radius });
}

function frenzy(sim: Sim): void {
  if (!trySpendUltimate(sim, DEF.ultimate.energyCost)) return;
  const p = sim.world.req(sim.player, 'player');
  p.frenzy = DEF.ultimate.durationTicks;
  p.rage = DEF.rage.max;
  const t = sim.world.req(sim.player, 'transform');
  sim.events.push({ type: 'ultStart', x: t.x, y: t.y });
  sim.events.push({ type: 'frenzy', x: t.x, y: t.y, on: true });
}

export const berserkerKit: Kit = {
  update(sim: Sim, input: InputFrame): void {
    const dash = sim.world.req(sim.player, 'dash');
    const wasLeaping = dash.active > 0;
    const leaping = updateDashMotion(sim);
    if (wasLeaping && dash.active === 0) land(sim);
    updateSpin(sim);
    if (leaping) return;
    const spinning = sim.world.req(sim.player, 'player').spin > 0;
    if (tryStartDash(sim, input)) return;
    if (!spinning) {
      runCombo(sim, DEF.combo, DEF.comboResetTicks);
      throwAxe(sim);
    }
    startSpin(sim);
    frenzy(sim);
  },
  busy: () => false,
  updateBusy: () => undefined,
  moveFactor(sim) {
    const p = sim.world.req(sim.player, 'player');
    const frenzied = p.frenzy > 0 ? 1 + DEF.ultimate.moveSpeedPct : 1;
    if (p.spin > 0) return DEF.spin.moveFactor * frenzied;
    return (isAttacking(sim) ? DEF.attackMoveFactor : 1) * frenzied;
  },
  /** Switch-in: crashes down in a shockwave, already angry. */
  entry(sim: Sim): void {
    const e = DEF.entry;
    playerBlast(sim, e.radius, e.damage, e.knockback, e.stagger, 'blood');
    gainRage(sim, e.rage);
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
        color: '#ff5a3d',
      },
      {
        key: 'ranged',
        label: DEF.labels.secondary,
        fill: 1 - p.rangedCooldown / DEF.axe.cooldownTicks,
        ready: p.rangedCooldown <= 0,
        color: '#ffb08a',
      },
      {
        key: 'skill',
        label: DEF.labels.skill,
        fill: p.spin > 0 ? 1 : 1 - p.skillCooldown / DEF.spin.cooldownTicks,
        ready: p.skillCooldown <= 0,
        color: '#ff5a3d',
      },
      {
        key: 'ultimate',
        label: DEF.labels.ultimate,
        fill:
          p.frenzy > 0 ? p.frenzy / DEF.ultimate.durationTicks : p.energy / DEF.ultimate.energyCost,
        ready: p.energy >= DEF.ultimate.energyCost,
        color: '#ffd34d',
      },
    ];
  },
};
