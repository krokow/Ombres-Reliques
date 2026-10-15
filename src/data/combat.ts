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

export const AI = {
  /** Enemies keep tracking a seen, visible player up to sightRange × this. */
  trackRangeMult: 1.6,
  /** A* paths are recomputed at most this often. */
  repathTicks: 20,
  /** Steering repulsion between enemies (anti-stacking), as a fraction of the seek direction. */
  separationWeight: 0.9,
  /** Extra spacing (px) kept between enemy bodies by steering. */
  separationPadding: 10,
  /** Blind strikes into the smoke veil use a longer cooldown so the veil keeps its value. */
  blindCooldownMult: 1.6,
  /** Distance at which a searching enemy considers the last known position reached. */
  arriveDistance: 16,
} as const;

export const FEEL = {
  hitstop: { hit: 2, crit: 4, kill: 6, playerHurt: 5, execution: 4 },
  /** Camera trauma (0..1) added per event. */
  shake: {
    hit: 0.12,
    crit: 0.22,
    kill: 0.3,
    playerHurt: 0.45,
    dash: 0.05,
    explosion: 0.5,
    execution: 0.3,
  },
} as const;
