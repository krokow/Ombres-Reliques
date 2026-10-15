import type { ClassId } from '../data/classes';
import type { EnemyId } from '../data/enemies';
import type { Entity, World } from './world';

/** Position with the previous tick's value kept for render interpolation. */
export interface Transform {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

/** Self-propelled velocity (what the entity wants to do). */
export interface Velocity {
  x: number;
  y: number;
}

/** Externally imposed velocity (knockback, lunges) that decays over time. */
export interface Impulse {
  x: number;
  y: number;
}

export interface Body {
  radius: number;
  /** Collides with walls. Projectiles handle walls themselves. */
  solid: boolean;
  /** Takes part in soft body-to-body separation. */
  pushable: boolean;
  /** Divides received knockback. */
  weight: number;
}

export interface Facing {
  angle: number;
}

export type Team = 'player' | 'enemy';

export interface Health {
  hp: number;
  max: number;
  /** Remaining invulnerability ticks. */
  invuln: number;
  /** Remaining stagger ticks (cannot act). */
  stagger: number;
}

export interface Mover {
  moveSpeed: number;
  accel: number;
  decel: number;
}

/** Ticks left on remembered button presses (input buffering). */
export interface ActionBuffer {
  attack: number;
  ranged: number;
  dash: number;
}

export interface DashState {
  charges: number;
  /** Progress (ticks) towards the next charge. */
  recharge: number;
  /** Remaining dash ticks; > 0 means dashing. */
  active: number;
  dirX: number;
  dirY: number;
}

export interface ComboState {
  /** Index of the hit currently playing (or the next one when idle). */
  index: number;
  /** Ticks elapsed in the current hit; -1 when idle. */
  tick: number;
  /** Ticks since the last hit ended, to reset the chain. */
  idleTicks: number;
  /** Hitbox entity spawned by the current hit, if any. */
  hitbox: Entity | null;
}

export interface PlayerState {
  classId: ClassId;
  rangedCooldown: number;
  energy: number;
  kills: number;
}

export type EnemyPhase = 'chase' | 'windup' | 'strike' | 'recover';

export interface EnemyState {
  defId: EnemyId;
  phase: EnemyPhase;
  phaseTicks: number;
  cooldown: number;
}

export type HitShape =
  { kind: 'arc'; range: number; arc: number } | { kind: 'circle'; radius: number; offset: number };

/** A damaging area. Lives on its own entity; optionally follows its owner. */
export interface Hitbox {
  owner: Entity;
  team: Team;
  shape: HitShape;
  /** Direction the hitbox faces (arc centre / circle offset direction). */
  angle: number;
  damage: number;
  knockback: number;
  stagger: number;
  /** Ticks before the hitbox starts dealing damage. */
  delay: number;
  /** Remaining active ticks. */
  ticks: number;
  /** Stick to the owner's position each tick. */
  attached: boolean;
  canCrit: boolean;
  /** Entities already hit: each hitbox hits a target at most once. */
  hit: Set<Entity>;
}

export interface Projectile {
  pierceLeft: number;
  lifetime: number;
}

export type RenderKind = 'shadowBlade' | 'ghoul' | 'shuriken';

export interface Renderable {
  kind: RenderKind;
}

/** All component types, keyed by name. Systems query by these keys. */
export interface Components {
  transform: Transform;
  velocity: Velocity;
  impulse: Impulse;
  body: Body;
  facing: Facing;
  team: Team;
  health: Health;
  mover: Mover;
  buffer: ActionBuffer;
  dash: DashState;
  combo: ComboState;
  player: PlayerState;
  enemy: EnemyState;
  hitbox: Hitbox;
  projectile: Projectile;
  renderable: Renderable;
}

export type GameWorld = World<Components>;

export function transformAt(x: number, y: number): Transform {
  return { x, y, prevX: x, prevY: y };
}
