import { SUMMONER as DEF } from '../../data/classes';
import { findFreeSpot, moveAndCollide } from '../../core/tilemap';
import type { InputFrame } from '../../game/inputFrame';
import type { Sim } from '../../game/sim';
import type { Entity } from '../../ecs/world';
import { commandAllies, maxWisps, summonColossus, summonWisps, wispCount } from '../allies';
import { aimPoint, isAttacking, mobilityDirection, runCombo, trySpendUltimate } from '../player';
import { scaledCooldown } from '../progression';
import type { Kit } from './kit';

/** Secondary: every summon rushes the enemy nearest the cursor. */
function command(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.ranged <= 0 || p.rangedCooldown > 0) return;
  buffer.ranged = 0;
  let target: Entity | null = null;
  let best = DEF.command.radius;
  for (const [e, , t, h] of w.query('enemy', 'transform', 'health')) {
    const d = Math.hypot(t.x - input.aimX, t.y - input.aimY);
    if (h.hp > 0 && d < best) {
      best = d;
      target = e;
    }
  }
  const n = commandAllies(sim, target, DEF.command.rushTicks);
  const t = w.req(sim.player, 'transform');
  if (n === 0) {
    sim.events.push({ type: 'interactFail', x: t.x, y: t.y, reason: 'Aucune invocation' });
    return;
  }
  p.rangedCooldown = scaledCooldown(sim, DEF.command.cooldownTicks);
  sim.events.push({ type: 'command', x: input.aimX, y: input.aimY, target });
}

/** Mobility: trade places with the wisp nearest the cursor, or blink a little without one. */
function swap(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const buffer = w.req(sim.player, 'buffer');
  const dash = w.req(sim.player, 'dash');
  if (buffer.dash <= 0 || dash.charges <= 0) return;
  buffer.dash = 0;
  dash.charges--;
  const t = w.req(sim.player, 'transform');
  const from = { x: t.x, y: t.y };
  let wisp: Entity | null = null;
  let best = Infinity;
  for (const [e, a, at] of w.query('ally', 'transform')) {
    if (a.kind !== 'wisp' || w.isPendingDestroy(e)) continue;
    const d = Math.hypot(at.x - input.aimX, at.y - input.aimY);
    if (d < best) {
      best = d;
      wisp = e;
    }
  }
  let to: { x: number; y: number };
  if (wisp !== null) {
    const at = w.req(wisp, 'transform');
    to = { x: at.x, y: at.y };
    at.x = at.prevX = from.x;
    at.y = at.prevY = from.y;
  } else {
    const dir = mobilityDirection(sim, input);
    const r = w.req(sim.player, 'body').radius;
    to = moveAndCollide(
      sim.map,
      t.x,
      t.y,
      r,
      dir.x * DEF.swap.blinkDistance,
      dir.y * DEF.swap.blinkDistance,
    );
  }
  // A wisp is smaller than the summoner: make sure the body fits where it lands.
  const fit = findFreeSpot(sim.map, to.x, to.y, w.req(sim.player, 'body').radius, 48) ?? from;
  t.x = t.prevX = fit.x;
  t.y = t.prevY = fit.y;
  to = fit;
  const h = w.req(sim.player, 'health');
  h.invuln = Math.max(h.invuln, DEF.swap.invulnTicks);
  sim.events.push({ type: 'blink', fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
}

/** Skill: calls wisps next to the player. */
function callWisps(sim: Sim): void {
  const w = sim.world;
  const p = w.req(sim.player, 'player');
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.skill <= 0 || p.skillCooldown > 0) return;
  buffer.skill = 0;
  const t = w.req(sim.player, 'transform');
  if (summonWisps(sim, t.x, t.y, DEF.summon.count) === 0) {
    sim.events.push({ type: 'interactFail', x: t.x, y: t.y, reason: 'Cortège complet' });
    return;
  }
  p.skillCooldown = scaledCooldown(sim, DEF.summon.cooldownTicks, 'skill');
}

function colossus(sim: Sim, input: InputFrame): void {
  if (!trySpendUltimate(sim, DEF.ultimate.energyCost)) return;
  const c = aimPoint(sim, input, 120);
  const t = sim.world.req(sim.player, 'transform');
  const spot = sim.map.isSolidAt(c.x, c.y) ? t : c;
  summonColossus(sim, spot.x, spot.y);
  sim.events.push({ type: 'ultStart', x: spot.x, y: spot.y });
  sim.events.push({ type: 'shockwave', x: spot.x, y: spot.y, radius: 90, color: 'soul' });
}

export const summonerKit: Kit = {
  update(sim: Sim, input: InputFrame): void {
    swap(sim, input);
    runCombo(sim, DEF.combo, DEF.comboResetTicks);
    command(sim, input);
    callWisps(sim);
    colossus(sim, input);
  },
  busy: () => false,
  updateBusy: () => undefined,
  moveFactor: (sim) => (isAttacking(sim) ? DEF.attackMoveFactor : 1),
  /** Switch-in: arrives with two wisps. */
  entry(sim: Sim): void {
    const t = sim.world.req(sim.player, 'transform');
    summonWisps(sim, t.x, t.y, DEF.entry.wisps);
    sim.events.push({ type: 'shockwave', x: t.x, y: t.y, radius: 60, color: 'soul' });
  },
  hud(sim) {
    const p = sim.world.req(sim.player, 'player');
    const dash = sim.world.req(sim.player, 'dash');
    const allies = sim.world.query('ally').length;
    return [
      {
        key: 'dash',
        label: DEF.labels.mobility,
        fill: dash.charges > 0 ? 1 : dash.recharge / DEF.dash.rechargeTicks,
        ready: dash.charges > 0,
        color: '#5cffc4',
      },
      {
        key: 'ranged',
        label: DEF.labels.secondary,
        fill: 1 - p.rangedCooldown / DEF.command.cooldownTicks,
        ready: p.rangedCooldown <= 0 && allies > 0,
        color: '#c8fff0',
      },
      {
        key: 'skill',
        label: DEF.labels.skill,
        fill: 1 - p.skillCooldown / DEF.summon.cooldownTicks,
        ready: p.skillCooldown <= 0 && wispCount(sim) < maxWisps(sim),
        color: '#5cffc4',
        count: `${wispCount(sim)}/${maxWisps(sim)}`,
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
