import type { ClassId } from '../data/classes';
import type { EliteModifierId } from '../data/elites';
import type { EnemyId } from '../data/enemies';
import type { StatusApplication, StatusId } from '../data/statuses';
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

/** 'neutral' hitboxes (explosions) hurt everyone. */
export type Team = 'player' | 'enemy' | 'neutral';

export interface Health {
  hp: number;
  max: number;
  /** Absorb pool consumed before HP. */
  shield: number;
  /** Ticks since damage was last taken (shield regen, etc.). */
  sinceHit: number;
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
  skill: number;
  ultimate: number;
  /** Requested party slot (buffered like other presses). */
  switchSlot: number;
  switchTicks: number;
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

export interface ExecutionState {
  targets: Entity[];
  /** Ticks until the next hop. */
  timer: number;
}

export interface MeteorState {
  x: number;
  y: number;
  left: number;
  timer: number;
}

/** Per-character runtime state (each party member owns one; the active one is installed). */
export interface PlayerState {
  classId: ClassId;
  /** Primary attack cooldown (classes without a combo). */
  primaryCooldown: number;
  /** Secondary action cooldown. */
  rangedCooldown: number;
  skillCooldown: number;
  energy: number;
  mana: number;
  /** Was inside a smoke veil last tick (leaving it grants Ambush). */
  inVeil: boolean;
  /** Shadow Blade ultimate in progress. */
  execution: ExecutionState | null;
  /** Guardian: ticks since the shield was raised, -1 when not blocking. */
  blockTicks: number;
  /** Arcanist: bolts fired (every Nth is empowered). */
  boltCount: number;
  /** Arcanist ultimate in progress. */
  meteors: MeteorState | null;
}

/** One party member. Its components are swapped onto the player entity when it is active. */
export interface Character {
  classId: ClassId;
  ko: boolean;
  /** Ticks before this character may be switched back in. */
  lockout: number;
  state: PlayerState;
  health: Health;
  dash: DashState;
  combo: ComboState;
  statuses: Statuses;
}

export interface Party {
  members: Character[];
  active: number;
  /** Global switch cooldown. */
  switchCooldown: number;
  kills: number;
}

export type EnemyPhase =
  'idle' | 'chase' | 'search' | 'windup' | 'strike' | 'recover' | 'fuse' | 'channel';

export interface EnemyState {
  defId: EnemyId;
  phase: EnemyPhase;
  phaseTicks: number;
  cooldown: number;
  /** Has noticed the player; keeps hunting their last known position. */
  alert: boolean;
  lastKnownX: number;
  lastKnownY: number;
  /** Point the current attack is aimed at. */
  aimX: number;
  aimY: number;
  /** Current attack is a blind strike into smoke. */
  blind: boolean;
  /** Cached A* path (tile coords) and the goal tile it was computed for. */
  path: { tx: number; ty: number }[];
  pathGoal: number;
  repath: number;
  /** Combined floor scaling × elite modifiers. */
  damageMult: number;
  speedMult: number;
}

export interface EliteState {
  mods: EliteModifierId[];
  lifesteal: number;
  explodesOnDeath: boolean;
}

/** Enemy spawned by a room encounter. */
export interface Encounter {
  room: number;
}

/** Headline enemy of a mini-boss/boss encounter (top-screen HP bar). */
export interface Champion {
  name: string;
}

export interface Minion {
  summoner: Entity;
}

export interface ActiveStatus {
  id: StatusId;
  ticks: number;
  source: Entity | null;
  /** Ticks until the next damage-over-time tick. */
  dotTimer: number;
}

export interface Statuses {
  list: ActiveStatus[];
}

export interface Zone {
  kind: 'smoke' | 'fire';
  radius: number;
  ticks: number;
  maxTicks: number;
  owner: Entity;
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
  /** Statuses applied to every target hit. */
  statuses: readonly StatusApplication[];
  /** Kills by this (neutral) hitbox count as player kills. */
  creditPlayer: boolean;
  /** Class that produced it (crit stats and passives survive a switch). */
  sourceClass: ClassId | null;
  /** Entities already hit: each hitbox hits a target at most once. */
  hit: Set<Entity>;
}

/** Area burst spawned when a projectile hits, expires or meets a wall. */
export interface BurstSpec {
  radius: number;
  damage: number;
  knockback: number;
  statuses: readonly StatusApplication[];
}

export interface Projectile {
  pierceLeft: number;
  lifetime: number;
  burst: BurstSpec | null;
}

export type RenderKind =
  ClassId | EnemyId | 'shuriken' | 'boneArrow' | 'arcaneBolt' | 'frostOrb' | 'explosion';

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
  party: Party;
  enemy: EnemyState;
  elite: EliteState;
  minion: Minion;
  encounter: Encounter;
  champion: Champion;
  statuses: Statuses;
  zone: Zone;
  hitbox: Hitbox;
  projectile: Projectile;
  renderable: Renderable;
}

export type GameWorld = World<Components>;

export function transformAt(x: number, y: number): Transform {
  return { x, y, prevX: x, prevY: y };
}
