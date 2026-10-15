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
} as const;

export const PLAYER_PROTOTYPE = {
  moveSpeed: 220,
  size: 24,
  color: '#9b7bff',
} as const;
