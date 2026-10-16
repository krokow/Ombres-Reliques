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

/** Pseudo-3D walls and lighting (render only). */
export const DEPTH = {
  /** Wall tops lean away from the screen centre by this fraction of their offset (perspective). */
  lean: 0.12,
  /** Cap on the lean, in world px (a tile is 32). */
  maxLean: 34,
  /** Closed doors are shorter than walls. */
  doorLean: 0.55,
  /** One torch per this many eligible wall tiles (hash-picked, deterministic). */
  torchEvery: 9,
} as const;

export const LIGHTS = {
  player: { radius: 340, intensity: 1 },
  torch: { radius: 190, intensity: 0.9 },
  wisp: { radius: 80, intensity: 0.6 },
  bolt: { radius: 70, intensity: 0.7 },
  fire: { radiusMult: 1.8, intensity: 0.9 },
  stairs: { radius: 140, intensity: 0.8 },
  loot: { radius: 46, intensity: 0.5 },
  explosionRadiusMult: 2.2,
  /** Training arena / non-dungeon darkness. */
  arenaDarkness: 0.3,
} as const;
