/** Engine-level constants (not balance: balance lives in the per-domain data files). */
export const ENGINE = {
  tickRate: 60,
  maxStepsPerFrame: 5,
  tileSize: 32,
} as const;

export const CAMERA = {
  /** Exponential follow rate (1/s): higher = snappier. */
  followRate: 10,
  /** Fraction of the cursor offset the camera leans towards. */
  aimLookahead: 0.18,
  maxLookahead: 140,
  zoom: 1.6,
  /** Max shake offset (px) and rotation (rad) at full trauma; trauma decays per second. */
  shakeOffset: 14,
  shakeAngle: 0.025,
  traumaDecay: 1.8,
} as const;
