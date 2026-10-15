import { normalize } from '../core/math';
import { CLASSES } from '../data/classes';
import { COMBAT, FEEL } from '../data/combat';
import { spawnHitbox, spawnShuriken } from '../game/factories';
import type { InputFrame } from '../game/inputFrame';
import type { Sim } from '../game/sim';
import { steer } from './movement';

/** Records presses for a few ticks so an input slightly too early still happens. */
export function playerBuffer(sim: Sim, input: InputFrame): void {
  const b = sim.world.get(sim.player, 'buffer');
  if (!b) return;
  b.attack = Math.max(0, b.attack - 1);
  b.ranged = Math.max(0, b.ranged - 1);
  b.dash = Math.max(0, b.dash - 1);
  if (input.attackPressed) b.attack = COMBAT.inputBufferTicks;
  // Holding the button keeps chaining without re-clicking.
  else if (input.attackHeld) b.attack = Math.max(b.attack, 1);
  if (input.rangedPressed) b.ranged = COMBAT.inputBufferTicks;
  if (input.dashPressed) b.dash = COMBAT.inputBufferTicks;
}

export function playerMove(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const e = sim.player;
  const t = w.req(e, 'transform');
  const v = w.req(e, 'velocity');
  const mover = w.req(e, 'mover');
  const def = CLASSES[w.req(e, 'player').classId];
  w.req(e, 'facing').angle = Math.atan2(input.aimY - t.y, input.aimX - t.x);
  if (w.req(e, 'dash').active > 0) return;
  const attacking = w.req(e, 'combo').tick >= 0;
  const speed = mover.moveSpeed * (attacking ? def.attackMoveFactor : 1);
  steer(v, input.moveX * speed, input.moveY * speed, mover.accel, mover.decel, sim.dt);
}

export function playerDash(sim: Sim, input: InputFrame): void {
  const w = sim.world;
  const e = sim.player;
  const dash = w.req(e, 'dash');
  const buffer = w.req(e, 'buffer');
  const def = CLASSES[w.req(e, 'player').classId].dash;
  const v = w.req(e, 'velocity');

  if (dash.charges < def.maxCharges && ++dash.recharge >= def.rechargeTicks) {
    dash.charges++;
    dash.recharge = 0;
  }

  if (dash.active > 0) {
    dash.active--;
    if (dash.active === 0) {
      const keep = w.req(e, 'mover').moveSpeed * def.exitMomentum;
      v.x = dash.dirX * keep;
      v.y = dash.dirY * keep;
    } else {
      v.x = dash.dirX * def.speed;
      v.y = dash.dirY * def.speed;
    }
    return;
  }

  if (buffer.dash > 0 && dash.charges > 0) {
    buffer.dash = 0;
    const facing = w.req(e, 'facing').angle;
    const dir =
      input.moveX !== 0 || input.moveY !== 0
        ? normalize(input.moveX, input.moveY)
        : { x: Math.cos(facing), y: Math.sin(facing) };
    dash.charges--;
    dash.active = def.durationTicks;
    // I-frames for the whole dash (+1 because invulnerability ticks down this tick).
    const health = w.req(e, 'health');
    health.invuln = Math.max(health.invuln, def.durationTicks + 1);
    dash.dirX = dir.x;
    dash.dirY = dir.y;
    v.x = dir.x * def.speed;
    v.y = dir.y * def.speed;
    const imp = w.req(e, 'impulse');
    imp.x = 0;
    imp.y = 0;
    cancelCombo(sim);
    const t = w.req(e, 'transform');
    sim.events.push({ type: 'dash', x: t.x, y: t.y, dirX: dir.x, dirY: dir.y });
  }
}

/** Dash cancels the current swing: that is the assassin's core rhythm. */
function cancelCombo(sim: Sim): void {
  const combo = sim.world.req(sim.player, 'combo');
  if (combo.hitbox !== null) sim.world.destroy(combo.hitbox);
  if (combo.tick >= 0)
    combo.index =
      (combo.index + 1) % CLASSES[sim.world.req(sim.player, 'player').classId].combo.length;
  combo.hitbox = null;
  combo.tick = -1;
  combo.idleTicks = 0;
}

export function playerCombo(sim: Sim): void {
  const w = sim.world;
  const e = sim.player;
  const combo = w.req(e, 'combo');
  const buffer = w.req(e, 'buffer');
  const def = CLASSES[w.req(e, 'player').classId];
  if (w.req(e, 'dash').active > 0) return;

  const startHit = (index: number): void => {
    combo.index = index;
    combo.tick = 0;
    combo.hitbox = null;
    buffer.attack = 0;
  };

  if (combo.tick < 0) {
    if (++combo.idleTicks > def.comboResetTicks) combo.index = 0;
    if (buffer.attack > 0) startHit(combo.index);
    else return;
  } else {
    combo.tick++;
  }

  const hit = def.combo[combo.index];
  if (!hit) return;
  const isLast = combo.index === def.combo.length - 1;
  const recoveryStart = hit.windupTicks + hit.activeTicks;

  if (combo.tick === hit.windupTicks) {
    const t = w.req(e, 'transform');
    const angle = w.req(e, 'facing').angle;
    combo.hitbox = spawnHitbox(sim, t.x, t.y, {
      owner: e,
      team: 'player',
      shape: { kind: 'arc', range: hit.range, arc: hit.arc },
      angle,
      damage: hit.damage,
      knockback: hit.knockback,
      stagger: hit.stagger,
      delay: 0,
      ticks: hit.activeTicks,
      attached: true,
      canCrit: true,
    });
    const imp = w.req(e, 'impulse');
    imp.x += Math.cos(angle) * hit.lunge;
    imp.y += Math.sin(angle) * hit.lunge;
    sim.events.push({
      type: 'swing',
      owner: e,
      x: t.x,
      y: t.y,
      angle,
      arc: hit.arc,
      range: hit.range,
      combo: combo.index,
    });
  }

  // Non-final hits can cancel their recovery into the next hit.
  if (!isLast && combo.tick >= recoveryStart && buffer.attack > 0) {
    startHit(combo.index + 1);
    return;
  }
  if (combo.tick >= recoveryStart + hit.recoveryTicks) {
    combo.tick = -1;
    combo.idleTicks = 0;
    combo.hitbox = null;
    combo.index = (combo.index + 1) % def.combo.length;
  }
}

export function playerRanged(sim: Sim): void {
  const w = sim.world;
  const e = sim.player;
  const player = w.req(e, 'player');
  const buffer = w.req(e, 'buffer');
  if (player.rangedCooldown > 0) player.rangedCooldown--;
  if (buffer.ranged <= 0 || player.rangedCooldown > 0 || w.req(e, 'dash').active > 0) return;
  buffer.ranged = 0;
  const def = CLASSES[player.classId];
  player.rangedCooldown = def.ranged.cooldownTicks;
  const t = w.req(e, 'transform');
  const angle = w.req(e, 'facing').angle;
  const x = t.x + Math.cos(angle) * def.radius;
  const y = t.y + Math.sin(angle) * def.radius;
  spawnShuriken(sim, e, x, y, angle);
  sim.events.push({ type: 'throw', x, y, angle });
}

/** Rewards a kill by the player: the assassin's reset loop. */
export function onPlayerKill(sim: Sim): void {
  const w = sim.world;
  const player = w.req(sim.player, 'player');
  const def = CLASSES[player.classId];
  const dash = w.req(sim.player, 'dash');
  player.kills++;
  player.energy = Math.min(def.maxEnergy, player.energy + def.energyOnKill);
  if (dash.charges < def.dash.maxCharges) {
    dash.charges = Math.min(def.dash.maxCharges, dash.charges + def.dash.refundOnKill);
    dash.recharge = 0;
    const t = w.req(sim.player, 'transform');
    sim.events.push({ type: 'dashRefund', x: t.x, y: t.y });
  }
  sim.hitstop(FEEL.hitstop.kill);
}
