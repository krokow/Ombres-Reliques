import { normalize } from '../core/math';
import { CLASSES, type ClassId } from '../data/classes';
import { COMBAT } from '../data/combat';
import type { MeleeHitDef } from '../data/types';
import { spawnHitbox } from '../game/factories';
import type { InputFrame } from '../game/inputFrame';
import type { Sim } from '../game/sim';
import { steer } from './movement';
import { moveMultiplier } from './statuses';

/** Generic player building blocks shared by every class kit. */

/** Records presses for a few ticks so an input slightly too early still happens. */
export function playerBuffer(sim: Sim, input: InputFrame): void {
  const b = sim.world.get(sim.player, 'buffer');
  if (!b) return;
  b.attack = Math.max(0, b.attack - 1);
  b.ranged = Math.max(0, b.ranged - 1);
  b.dash = Math.max(0, b.dash - 1);
  b.skill = Math.max(0, b.skill - 1);
  b.ultimate = Math.max(0, b.ultimate - 1);
  b.switchTicks = Math.max(0, b.switchTicks - 1);
  if (input.skillPressed) b.skill = COMBAT.inputBufferTicks;
  if (input.ultimatePressed) b.ultimate = COMBAT.inputBufferTicks;
  if (input.attackPressed) b.attack = COMBAT.inputBufferTicks;
  // Holding the button keeps chaining without re-clicking.
  else if (input.attackHeld) b.attack = Math.max(b.attack, 1);
  if (input.rangedPressed) b.ranged = COMBAT.inputBufferTicks;
  if (input.dashPressed) b.dash = COMBAT.inputBufferTicks;
  if (input.switchTo >= 0) {
    b.switchSlot = input.switchTo;
    b.switchTicks = COMBAT.inputBufferTicks;
  }
}

export function activeClass(sim: Sim): ClassId {
  return sim.world.req(sim.player, 'player').classId;
}

/** Faces the cursor and steers towards the move input, scaled by the kit's current factor. */
export function playerMove(sim: Sim, input: InputFrame, speedFactor: number): void {
  const w = sim.world;
  const e = sim.player;
  const t = w.req(e, 'transform');
  const v = w.req(e, 'velocity');
  const mover = w.req(e, 'mover');
  w.req(e, 'facing').angle = Math.atan2(input.aimY - t.y, input.aimX - t.x);
  if (w.req(e, 'dash').active > 0) return;
  const speed = mover.moveSpeed * speedFactor * moveMultiplier(w, e);
  steer(v, input.moveX * speed, input.moveY * speed, mover.accel, mover.decel, sim.dt);
}

/** Direction for mobility skills: movement input if any, else the aim. */
export function mobilityDirection(sim: Sim, input: InputFrame): { x: number; y: number } {
  if (input.moveX !== 0 || input.moveY !== 0) return normalize(input.moveX, input.moveY);
  const facing = sim.world.req(sim.player, 'facing').angle;
  return { x: Math.cos(facing), y: Math.sin(facing) };
}

/** Moves the active dash forward; returns true while dashing. */
export function updateDashMotion(sim: Sim): boolean {
  const w = sim.world;
  const e = sim.player;
  const dash = w.req(e, 'dash');
  if (dash.active <= 0) return false;
  const def = CLASSES[activeClass(sim)].dash;
  const v = w.req(e, 'velocity');
  dash.active--;
  if (dash.active === 0) {
    const keep = w.req(e, 'mover').moveSpeed * def.exitMomentum;
    v.x = dash.dirX * keep;
    v.y = dash.dirY * keep;
  } else {
    v.x = dash.dirX * def.speed;
    v.y = dash.dirY * def.speed;
  }
  return true;
}

/** Starts a dash if a buffered press and a charge are available. */
export function tryStartDash(sim: Sim, input: InputFrame): boolean {
  const w = sim.world;
  const e = sim.player;
  const dash = w.req(e, 'dash');
  const buffer = w.req(e, 'buffer');
  if (buffer.dash <= 0 || dash.charges <= 0 || dash.active > 0) return false;
  const def = CLASSES[activeClass(sim)].dash;
  buffer.dash = 0;
  const dir = mobilityDirection(sim, input);
  dash.charges--;
  dash.active = def.durationTicks;
  // I-frames for the whole dash (+1 because invulnerability ticks down this tick).
  const health = w.req(e, 'health');
  health.invuln = Math.max(health.invuln, def.durationTicks + 1);
  dash.dirX = dir.x;
  dash.dirY = dir.y;
  const v = w.req(e, 'velocity');
  v.x = dir.x * def.speed;
  v.y = dir.y * def.speed;
  const imp = w.req(e, 'impulse');
  imp.x = 0;
  imp.y = 0;
  cancelCombo(sim);
  const t = w.req(e, 'transform');
  sim.events.push({ type: 'dash', x: t.x, y: t.y, dirX: dir.x, dirY: dir.y });
  return true;
}

/** Cancels the current swing (dash, switch…). */
export function cancelCombo(sim: Sim, comboLength = 1): void {
  const combo = sim.world.req(sim.player, 'combo');
  if (combo.hitbox !== null) sim.world.destroy(combo.hitbox);
  if (combo.tick >= 0) combo.index = (combo.index + 1) % Math.max(1, comboLength);
  combo.hitbox = null;
  combo.tick = -1;
  combo.idleTicks = 0;
}

export function isAttacking(sim: Sim): boolean {
  return sim.world.req(sim.player, 'combo').tick >= 0;
}

/**
 * Melee combo state machine: windup → active arc hitbox (+ lunge) → recovery.
 * Non-final hits can cancel their recovery into the next hit.
 */
export function runCombo(sim: Sim, hits: readonly MeleeHitDef[], resetTicks: number): void {
  const w = sim.world;
  const e = sim.player;
  const combo = w.req(e, 'combo');
  const buffer = w.req(e, 'buffer');
  if (w.req(e, 'dash').active > 0) return;

  const startHit = (index: number): void => {
    combo.index = index;
    combo.tick = 0;
    combo.hitbox = null;
    buffer.attack = 0;
  };

  if (combo.tick < 0) {
    if (++combo.idleTicks > resetTicks) combo.index = 0;
    if (buffer.attack > 0) startHit(combo.index);
    else return;
  } else {
    combo.tick++;
  }

  const hit = hits[combo.index];
  if (!hit) return;
  const isLast = combo.index === hits.length - 1;
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
      sourceClass: activeClass(sim),
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

  if (!isLast && combo.tick >= recoveryStart && buffer.attack > 0) {
    startHit(combo.index + 1);
    return;
  }
  if (combo.tick >= recoveryStart + hit.recoveryTicks) {
    combo.tick = -1;
    combo.idleTicks = 0;
    combo.hitbox = null;
    combo.index = (combo.index + 1) % hits.length;
  }
}

/** Spends energy for the ultimate, or reports why it can't. */
export function trySpendUltimate(sim: Sim, cost: number): boolean {
  const w = sim.world;
  const buffer = w.req(sim.player, 'buffer');
  if (buffer.ultimate <= 0) return false;
  buffer.ultimate = 0;
  const player = w.req(sim.player, 'player');
  if (player.energy < cost) {
    const t = w.req(sim.player, 'transform');
    sim.events.push({ type: 'ultFail', x: t.x, y: t.y, reason: 'energy' });
    return false;
  }
  player.energy -= cost;
  return true;
}

/** Point at the cursor, clamped to `maxRange` from the player. */
export function aimPoint(sim: Sim, input: InputFrame, maxRange: number): { x: number; y: number } {
  const t = sim.world.req(sim.player, 'transform');
  const dx = input.aimX - t.x;
  const dy = input.aimY - t.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxRange) return { x: input.aimX, y: input.aimY };
  return { x: t.x + (dx / d) * maxRange, y: t.y + (dy / d) * maxRange };
}

/** Enemies within `radius` of (x, y) and in line of sight of that point. */
export function enemiesAround(sim: Sim, x: number, y: number, radius: number): number[] {
  return sim.world
    .query('enemy', 'transform', 'body', 'health')
    .filter(
      ([e, , t, b, h]) =>
        h.hp > 0 &&
        !sim.world.isPendingDestroy(e) &&
        Math.hypot(t.x - x, t.y - y) <= radius + b.radius &&
        sim.map.lineOfSight(x, y, t.x, t.y),
    )
    .map(([e]) => e);
}
