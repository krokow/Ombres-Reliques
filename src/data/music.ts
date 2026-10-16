import type { BiomeId } from './biomes';

/**
 * Procedural ambient music: slow pad chords (soft sine/triangle voices)
 * plus a few bell notes picked from the current chord. Chords are semitone
 * offsets from `root` (Hz); each lasts `chordSeconds`.
 */
export interface MusicTheme {
  root: number;
  chords: readonly (readonly number[])[];
  chordSeconds: number;
  /** Chance per half-chord beat that a bell note plays. */
  bellChance: number;
  /** Pad brightness (lowpass cutoff, Hz). */
  warmth: number;
}

export const MUSIC: Record<BiomeId | 'title', MusicTheme> = {
  // Am – F – C – G : nostalgique, calme.
  title: {
    root: 110,
    chords: [
      [0, 3, 7],
      [-4, 0, 3],
      [3, 7, 10],
      [-2, 2, 5],
    ],
    chordSeconds: 6,
    bellChance: 0.35,
    warmth: 1100,
  },
  // Am – Dm – Am – E : sombre et lent.
  crypt: {
    root: 110,
    chords: [
      [0, 3, 7],
      [5, 8, 12],
      [0, 3, 7],
      [-5, -1, 2],
    ],
    chordSeconds: 7,
    bellChance: 0.25,
    warmth: 900,
  },
  // Em – C – D – Em : plus aérien.
  forest: {
    root: 82.41,
    chords: [
      [0, 3, 7],
      [-4, 0, 3],
      [-2, 2, 5],
      [0, 3, 7],
    ],
    chordSeconds: 6,
    bellChance: 0.4,
    warmth: 1300,
  },
  // Dm – B♭ – Gm – A : tendu.
  forge: {
    root: 73.42,
    chords: [
      [0, 3, 7],
      [-4, 0, 3],
      [-7, -4, 0],
      [-5, -1, 2],
    ],
    chordSeconds: 5,
    bellChance: 0.3,
    warmth: 1000,
  },
};

export const MUSIC_MIX = {
  /** Overall music level before the player's volume setting. */
  level: 1.8,
  /** Soft low pulse added during sealed-room fights (0..1 intensity). */
  combatPulse: 0.5,
  /** Seconds to cross-fade between themes. */
  fade: 2.5,
} as const;
