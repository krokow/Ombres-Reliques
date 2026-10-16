import { angleDiff, clamp, normalize, type Vec2 } from '../../core/math';
import { AI } from '../../data/combat';
import type { EnemyDef } from '../../data/enemies';
import type {
  Body,
  EnemyPhase,
  EnemyState,
  Facing,
  Mover,
  Transform,
  Velocity,
} from '../../ecs/components';
import type { Entity } from '../../ecs/world';
import type { Sim } from '../../game/sim';
import { steer } from '../movement';
import { findPath } from '../pathfinding';
import { smokeAt } from '../zones';
import { hasStatus, moveMultiplier } from '../statuses';

export interface Neighbor {
  e: Entity;
  t: Transform;
  b: Body;
}

/** Everything a behaviour needs about one enemy for this tick. */
export interface AgentCtx {
  sim: Sim;
  e: Entity;
  def: EnemyDef;
  ai: EnemyState;
  t: Transform;
  v: Velocity;
  facing: Facing;
  mover: Mover;
  body: Body;
  speedMult: number;
  damageMult: number;
  staggered: boolean;
  /** Provoked by the Guardian: ranged enemies stop kiting and close in. */
  taunted: boolean;
  neighbors: readonly Neighbor[];
  /** Currently knows where the player is (visible or tracked). */
  knows: boolean;
  /** Direct line of sight to the player (needed to shoot). */
  canSee: boolean;
  px: number;
  py: number;
  dist: number;
  playerRadius: number;
  /** Smoke veil hiding the player's last known position (blind strikes, design 2b). */
  veil: { x: number; y: number; radius: number } | null;
}

export function setPhase(ai: EnemyState, phase: EnemyPhase): void {
  ai.phase = phase;
  ai.phaseTicks = 0;
}

/** Fills the perception part of the context and updates alert / last known position. */
export function perceive(
  ctx: Omit<AgentCtx, 'knows' | 'canSee' | 'px' | 'py' | 'dist' | 'playerRadius' | 'veil'>,
): AgentCtx {
  const { sim, ai, t, def } = ctx;
  const w = sim.world;
  const pt = w.get(sim.player, 'transform');
  const playerRadius = w.get(sim.player, 'body')?.radius ?? 0;
  const base = {
    ...ctx,
    knows: false,
    canSee: false,
    px: ai.lastKnownX,
    py: ai.lastKnownY,
    dist: Infinity,
    playerRadius,
    veil: null,
  };
  if (!pt || !sim.playerAlive) return base;

  const dist = Math.hypot(pt.x - t.x, pt.y - t.y);
  const invisible = hasStatus(w, sim.player, 'invisible');
  if (!invisible) {
    const los = sim.map.lineOfSight(t.x, t.y, pt.x, pt.y);
    if (!ai.alert && dist <= def.sightRange && los) ai.alert = true;
    if (ai.alert && dist <= def.sightRange * AI.trackRangeMult) {
      ai.lastKnownX = pt.x;
      ai.lastKnownY = pt.y;
      return { ...base, knows: true, canSee: los, px: pt.x, py: pt.y, dist };
    }
  }
  // The player vanished: if they were last seen in (or at the edge of) smoke, strike into it.
  const veil = ai.alert ? smokeAt(sim, ai.lastKnownX, ai.lastKnownY, 24) : null;
  return { ...base, veil };
}

export function turnTowards(ctx: AgentCtx, angle: number, rate: number): void {
  const max = rate * ctx.sim.dt;
  ctx.facing.angle += clamp(angleDiff(ctx.facing.angle, angle), -max, max);
}

export function angleTo(ctx: AgentCtx, x: number, y: number): number {
  return Math.atan2(y - ctx.t.y, x - ctx.t.x);
}

export function distTo(ctx: AgentCtx, x: number, y: number): number {
  return Math.hypot(x - ctx.t.x, y - ctx.t.y);
}

export function halt(ctx: AgentCtx): void {
  steer(ctx.v, 0, 0, ctx.mover.accel, ctx.mover.decel, ctx.sim.dt);
}

/** True if both edges of the body have a clear line to the goal. */
function bodyClear(ctx: AgentCtx, gx: number, gy: number): boolean {
  const { t, body } = ctx;
  const d = normalize(gx - t.x, gy - t.y);
  const ox = -d.y * body.radius;
  const oy = d.x * body.radius;
  const map = ctx.sim.map;
  return (
    map.lineOfSight(t.x + ox, t.y + oy, gx + ox, gy + oy) &&
    map.lineOfSight(t.x - ox, t.y - oy, gx - ox, gy - oy)
  );
}

/**
 * Direction to walk towards a goal: straight when clear, else the shared
 * player flow field, else a cached A* path (for any other goal).
 */
function seek(ctx: AgentCtx, gx: number, gy: number, goalIsPlayer: boolean): Vec2 {
  const direct = normalize(gx - ctx.t.x, gy - ctx.t.y);
  if (bodyClear(ctx, gx, gy)) return direct;
  const { map } = ctx.sim;
  const s = map.tileSize;
  const tx = Math.floor(ctx.t.x / s);
  const ty = Math.floor(ctx.t.y / s);
  if (goalIsPlayer) {
    const next = ctx.sim.nav.nextTile(tx, ty);
    if (!next) return direct;
    const c = map.tileCenter(next.tx, next.ty);
    return normalize(c.x - ctx.t.x, c.y - ctx.t.y);
  }
  const { ai } = ctx;
  const goal = Math.floor(gy / s) * map.width + Math.floor(gx / s);
  if (goal !== ai.pathGoal || ai.repath <= 0 || ai.path.length === 0) {
    ai.path = findPath(map, { tx, ty }, { tx: Math.floor(gx / s), ty: Math.floor(gy / s) }) ?? [];
    ai.pathGoal = goal;
    ai.repath = AI.repathTicks;
  }
  while (ai.path.length > 0 && ai.path[0]?.tx === tx && ai.path[0]?.ty === ty) ai.path.shift();
  const node = ai.path[0];
  if (!node) return direct;
  const c = map.tileCenter(node.tx, node.ty);
  return normalize(c.x - ctx.t.x, c.y - ctx.t.y);
}

/**
 * Repulsion from wall tiles touching the body (+ padding). Path directions
 * aim at tile centres, which a body wider than a tile can't reach around a
 * pillar corner; this nudge makes it slide off instead of sticking.
 */
function wallAvoid(ctx: AgentCtx): Vec2 {
  const { map } = ctx.sim;
  const s = map.tileSize;
  const reach = ctx.body.radius * (1 + AI.wallAvoidPadding);
  let x = 0;
  let y = 0;
  const x0 = Math.floor((ctx.t.x - reach) / s);
  const x1 = Math.floor((ctx.t.x + reach) / s);
  const y0 = Math.floor((ctx.t.y - reach) / s);
  const y1 = Math.floor((ctx.t.y + reach) / s);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!map.isSolid(tx, ty)) continue;
      const cx = clamp(ctx.t.x, tx * s, (tx + 1) * s);
      const cy = clamp(ctx.t.y, ty * s, (ty + 1) * s);
      const dx = ctx.t.x - cx;
      const dy = ctx.t.y - cy;
      const d = Math.hypot(dx, dy);
      if (d >= reach || d < 1e-6) continue;
      const k = 1 - d / reach;
      x += (dx / d) * k;
      y += (dy / d) * k;
    }
  }
  return { x, y };
}

/** Steering repulsion from nearby enemies, so groups spread out instead of stacking. */
function separation(ctx: AgentCtx): Vec2 {
  let x = 0;
  let y = 0;
  for (const n of ctx.neighbors) {
    if (n.e === ctx.e) continue;
    const dx = ctx.t.x - n.t.x;
    const dy = ctx.t.y - n.t.y;
    const range = ctx.body.radius + n.b.radius + AI.separationPadding;
    const d2 = dx * dx + dy * dy;
    if (d2 >= range * range || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const k = 1 - d / range;
    x += (dx / d) * k;
    y += (dy / d) * k;
  }
  return { x, y };
}

function speedOf(ctx: AgentCtx, factor: number): number {
  return ctx.mover.moveSpeed * factor * ctx.speedMult * moveMultiplier(ctx.sim.world, ctx.e);
}

export function moveToward(
  ctx: AgentCtx,
  gx: number,
  gy: number,
  factor: number,
  goalIsPlayer: boolean,
): void {
  const dir = seek(ctx, gx, gy, goalIsPlayer);
  const sep = separation(ctx);
  const wall = wallAvoid(ctx);
  const d = normalize(
    dir.x + sep.x * AI.separationWeight + wall.x * AI.wallAvoidWeight,
    dir.y + sep.y * AI.separationWeight + wall.y * AI.wallAvoidWeight,
  );
  const speed = speedOf(ctx, factor);
  steer(ctx.v, d.x * speed, d.y * speed, ctx.mover.accel, ctx.mover.decel, ctx.sim.dt);
}

export function moveAway(ctx: AgentCtx, fx: number, fy: number, factor: number): void {
  const away = normalize(ctx.t.x - fx, ctx.t.y - fy);
  const sep = separation(ctx);
  const d = normalize(away.x + sep.x, away.y + sep.y);
  const speed = speedOf(ctx, factor);
  steer(ctx.v, d.x * speed, d.y * speed, ctx.mover.accel, ctx.mover.decel, ctx.sim.dt);
}

/** Walk to the last known position; give up (idle) on arrival. */
export function searchOrIdle(ctx: AgentCtx): void {
  const { ai } = ctx;
  if (!ai.alert) {
    if (ai.phase !== 'idle') setPhase(ai, 'idle');
    halt(ctx);
    return;
  }
  if (ai.phase !== 'search') setPhase(ai, 'search');
  if (distTo(ctx, ai.lastKnownX, ai.lastKnownY) <= AI.arriveDistance) {
    ai.alert = false;
    setPhase(ai, 'idle');
    halt(ctx);
    return;
  }
  moveToward(ctx, ai.lastKnownX, ai.lastKnownY, 0.8, false);
  turnTowards(ctx, Math.atan2(ctx.v.y, ctx.v.x), ctx.def.turnRate);
}

/**
 * Design 2b: the player hid in smoke. Wait at its edge while on cooldown,
 * then pick a random point inside and attack it once within `reach`.
 */
export function blindPursuit(
  ctx: AgentCtx,
  reach: number,
  needsSight: boolean,
  attack: () => void,
): void {
  const { ai, sim } = ctx;
  const veil = ctx.veil;
  if (!veil) return;
  if (ai.phase !== 'search') setPhase(ai, 'search');
  if (ai.cooldown > 0) {
    ai.blind = false;
    if (distTo(ctx, veil.x, veil.y) > veil.radius + ctx.body.radius + 8)
      moveToward(ctx, veil.x, veil.y, 0.7, false);
    else halt(ctx);
    turnTowards(ctx, angleTo(ctx, veil.x, veil.y), ctx.def.turnRate);
    return;
  }
  if (!ai.blind) {
    const a = sim.rng.ai.range(-Math.PI, Math.PI);
    const r = Math.sqrt(sim.rng.ai.next()) * veil.radius;
    ai.aimX = veil.x + Math.cos(a) * r;
    ai.aimY = veil.y + Math.sin(a) * r;
    ai.blind = true;
  }
  turnTowards(ctx, angleTo(ctx, ai.aimX, ai.aimY), ctx.def.turnRate);
  const inReach = distTo(ctx, ai.aimX, ai.aimY) <= reach;
  if (inReach && (!needsSight || sim.map.lineOfSight(ctx.t.x, ctx.t.y, ai.aimX, ai.aimY))) attack();
  else moveToward(ctx, ai.aimX, ai.aimY, 1, false);
}
