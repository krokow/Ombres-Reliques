/** Global combat & feel tuning shared by every class/enemy. */
export const COMBAT = {
  /** Half-angle of the target's rear cone that counts as "from behind" (radians). */
  backstabHalfArc: (70 * Math.PI) / 180,
  /** A press is remembered this long, so inputs during hit-stop or recovery aren't lost. */
  inputBufferTicks: 9,
  /** Exponential decay rate (1/s) of knockback velocity. */
  knockbackFriction: 9,
  /** Strength of the soft push between overlapping bodies. */
  separationStrength: 0.5,
} as const;

export const FEEL = {
  hitstop: { hit: 2, crit: 4, kill: 6, playerHurt: 5 },
  /** Camera trauma (0..1) added per event. */
  shake: { hit: 0.12, crit: 0.22, kill: 0.3, playerHurt: 0.45, dash: 0.05 },
} as const;
