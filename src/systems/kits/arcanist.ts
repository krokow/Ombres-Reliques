import { ARCANIST as DEF } from '../../data/classes';
import { moveAndCollide } from '../../core/tilemap';
import { spawnExplosion, spawnPlayerProjectile, spawnZone } from '../../game/factories';
import type { InputFrame } from '../../game/inputFrame';
import type { Sim } from '../../game/sim';
import { dealDamage } from '../damage';
import { aimPoint, enemiesAround, mobilityDirection, trySpendUltimate } from '../player';
import { applyStatus } from '../statuses';
import type { Kit } from './kit';

function slowAround(
  sim: Sim,
  x: number,
  y: number,
  radius: number,
  damage: number,
  slowTicks: number,
): void {
  for (const e of enemiesAround(sim, x, y, radius)) {
    applyStatus(sim, e, 'slow', slowTicks, sim.player);
    if (damage <= 0) continue;
    const et = sim.world.req(e, 'transform');
    const a = Math.atan2(et.y - y, et.x - x);
    dealDamage(sim, e, {
      amount: damage,
      source: sim.player,
      byPlayer: true,
      crit: false,
      backstab: false,
      dirX: Math.cos(a),
      dirY: Math.sin(a),
      knockback: 120,
      stagger: 8,
      dot: false,
      originX: x,
      originY: y,
    });
  }
}

/** Primary: arcane bolts; every Nth one pierces and hits harder. */
function bolts(sim: Sim): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.attack <= 0 || p.primaryCooldown > 0) return;
  buffer.attack = 0;
  const b = DEF.bolt;
  p.primaryCooldown = b.cooldownTicks;
  p.boltCount++;
  const empowered = p.boltCount % b.empowerEvery === 0;
  const t = w.req(sim.player, 'transform');
  const angle = w.req(sim.player, 'facing').angle;
  const x = t.x + Math.cos(angle) * (DEF.radius + 4);
  const y = t.y + Math.sin(angle) * (DEF.radius + 4);
  spawnPlayerProjectile(sim, sim.player, x, y, angle, {
    ...b,
    damage: Math.round(b.damage * (empowered ? b.empoweredDamageMult : 1)),
    pierce: empowered ? b.empoweredPierce : b.pierce,
    radius: empowered ? b.radius * 1.6 : b.radius,
    kind: 'arcaneBolt',
  });
  sim.events.push({ type: 'cast', x, y, angle, spell: empowered ? 'empowered' : 'bolt' });
}

function spendMana(sim: Sim, cost: number): boolean {
  const p = sim.world.req(sim.player, 'player');
  if (p.mana < cost) {
    const t = sim.world.req(sim.player, 'transform');
    sim.events.push({ type: 'interactFail', x: t.x, y: t.y, reason: 'Mana insuffisant' });
    return false;
  }
  p.mana -= cost;
  return true;
}

/** Secondary: frost orb that bursts at the cursor (or on the first enemy it meets). */
function frostOrb(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.ranged <= 0 || p.rangedCooldown > 0) return;
  buffer.ranged = 0;
  const o = DEF.frostOrb;
  if (!spendMana(sim, o.manaCost)) return;
  p.rangedCooldown = o.cooldownTicks;
  const t = w.req(sim.player, 'transform');
  const target = aimPoint(sim, input, o.maxRange);
  const angle = Math.atan2(target.y - t.y, target.x - t.x);
  const dist = Math.hypot(target.x - t.x, target.y - t.y);
  spawnPlayerProjectile(sim, sim.player, t.x, t.y, angle, {
    damage: 0,
    speed: o.speed,
    radius: 7,
    lifetimeTicks: Math.max(1, Math.round((dist / o.speed) * 60)),
    knockback: 0,
    pierce: 0,
    stagger: 0,
    kind: 'frostOrb',
    burst: {
      radius: o.radius,
      damage: o.damage,
      knockback: 160,
      statuses: [{ id: 'slow', ticks: o.slowTicks }],
    },
  });
  sim.events.push({ type: 'cast', x: t.x, y: t.y, angle, spell: 'frost' });
}

/** Mobility: short teleport (stops at walls), leaving a chilling puff behind. */
function blink(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const buffer = w.req(sim.player, 'buffer');
  const dash = w.req(sim.player, 'dash');
  if (buffer.dash <= 0 || dash.charges <= 0) return;
  buffer.dash = 0;
  dash.charges--;
  const t = w.req(sim.player, 'transform');
  const body = w.req(sim.player, 'body');
  const dir = mobilityDirection(sim, input);
  const from = { x: t.x, y: t.y };
  const to = moveAndCollide(
    sim.map,
    t.x,
    t.y,
    body.radius,
    dir.x * DEF.blink.distance,
    dir.y * DEF.blink.distance,
  );
  t.x = t.prevX = to.x;
  t.y = t.prevY = to.y;
  const h = w.req(sim.player, 'health');
  h.invuln = Math.max(h.invuln, DEF.blink.invulnTicks);
  slowAround(sim, from.x, from.y, DEF.blink.frostRadius, 0, DEF.blink.slowTicks);
  sim.events.push({ type: 'blink', fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
  sim.events.push({
    type: 'shockwave',
    x: from.x,
    y: from.y,
    radius: DEF.blink.frostRadius,
    color: 'frost',
  });
}

/** Skill: burning ground at the cursor. */
function firefield(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.skill <= 0 || p.skillCooldown > 0) return;
  buffer.skill = 0;
  const f = DEF.firefield;
  if (!spendMana(sim, f.manaCost)) return;
  p.skillCooldown = f.cooldownTicks;
  const target = aimPoint(sim, input, f.maxRange);
  spawnZone(sim, 'fire', sim.player, target.x, target.y, f.radius, f.durationTicks);
  sim.events.push({ type: 'cast', x: target.x, y: target.y, angle: 0, spell: 'fire' });
}

/** Ultimate: meteor shower around the cursor; each meteor is telegraphed. */
function meteors(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const u = DEF.ultimate;
  if (!p.meteors && trySpendUltimate(sim, u.energyCost)) {
    const c = aimPoint(sim, input, 360);
    p.meteors = { x: c.x, y: c.y, left: u.meteors, timer: 0 };
    sim.events.push({ type: 'ultStart', x: c.x, y: c.y });
  }
  const m = p.meteors;
  if (!m || --m.timer > 0) return;
  // The first meteor always lands on the cursor, the rest scatter around it.
  const first = m.left === u.meteors;
  const a = sim.rng.combat.range(-Math.PI, Math.PI);
  const r = first ? 0 : Math.sqrt(sim.rng.combat.next()) * u.spread;
  const x = m.x + Math.cos(a) * r;
  const y = m.y + Math.sin(a) * r;
  if (!sim.map.isSolidAt(x, y)) {
    spawnExplosion(sim, sim.player, x, y, {
      radius: u.radius,
      damage: u.damage,
      knockback: u.knockback,
      delayTicks: u.fallTicks,
      creditPlayer: true,
      team: 'player',
      sourceClass: 'arcanist',
    });
    sim.events.push({ type: 'cast', x, y, angle: 0, spell: 'meteor' });
  }
  m.timer = u.intervalTicks;
  if (--m.left <= 0) p.meteors = null;
}

export const arcanistKit: Kit = {
  update(sim: Sim, input: InputFrame): void {
    blink(sim, input);
    bolts(sim);
    frostOrb(sim, input);
    firefield(sim, input);
    meteors(sim, input);
  },
  busy: () => false,
  updateBusy: () => undefined,
  moveFactor: (sim) =>
    sim.world.req(sim.player, 'player').primaryCooldown > 0 ? DEF.attackMoveFactor : 1,
  /** Switch-in: frost nova around the arrival point. */
  entry(sim: Sim): void {
    const t = sim.world.req(sim.player, 'transform');
    slowAround(sim, t.x, t.y, DEF.entry.radius, DEF.entry.damage, DEF.entry.slowTicks);
    sim.events.push({
      type: 'shockwave',
      x: t.x,
      y: t.y,
      radius: DEF.entry.radius,
      color: 'frost',
    });
  },
  hud(sim) {
    const p = sim.world.req(sim.player, 'player');
    const dash = sim.world.req(sim.player, 'dash');
    const manaOk = (cost: number): boolean => p.mana >= cost;
    return [
      {
        key: 'dash',
        label: DEF.labels.mobility,
        fill: dash.charges > 0 ? 1 : dash.recharge / DEF.dash.rechargeTicks,
        ready: dash.charges > 0,
        color: '#6fd0ff',
      },
      {
        key: 'ranged',
        label: DEF.labels.secondary,
        fill: 1 - p.rangedCooldown / DEF.frostOrb.cooldownTicks,
        ready: p.rangedCooldown <= 0 && manaOk(DEF.frostOrb.manaCost),
        color: '#bff0ff',
      },
      {
        key: 'skill',
        label: DEF.labels.skill,
        fill: 1 - p.skillCooldown / DEF.firefield.cooldownTicks,
        ready: p.skillCooldown <= 0 && manaOk(DEF.firefield.manaCost),
        color: '#ff8a3d',
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
