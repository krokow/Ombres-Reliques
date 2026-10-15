/** Shared definitions for data files. Durations are in ticks (60/s), distances in pixels. */

export interface MeleeHitDef {
  damage: number;
  /** Reach from the attacker's centre. */
  range: number;
  /** Total sector angle, radians. */
  arc: number;
  windupTicks: number;
  activeTicks: number;
  recoveryTicks: number;
  knockback: number;
  /** Forward impulse on the attacker when the hit starts. */
  lunge: number;
  /** Ticks the target is staggered (interrupts enemy wind-ups). */
  stagger: number;
}

export interface ProjectileDef {
  damage: number;
  speed: number;
  radius: number;
  lifetimeTicks: number;
  knockback: number;
  pierce: number;
  cooldownTicks: number;
  stagger: number;
}

export interface DashDef {
  maxCharges: number;
  /** Ticks to regain one charge. */
  rechargeTicks: number;
  durationTicks: number;
  speed: number;
  /** Fraction of move speed kept as momentum when the dash ends. */
  exitMomentum: number;
  /** Charges refunded when the player lands a kill. */
  refundOnKill: number;
}

export interface MoverDef {
  moveSpeed: number;
  accel: number;
  decel: number;
}
