import type { BiomeId } from './biomes';

/**
 * Procedural ambient music (M9): a drone on the root plus a sparse
 * arpeggio drawn from a scale. Semitone offsets from `root` (Hz).
 */
export interface MusicTheme {
  root: number;
  scale: readonly number[];
  /** Arpeggio steps per minute. */
  bpm: number;
  /** Chance that a step plays a note (sparser = calmer). */
  density: number;
  lead: OscillatorType;
  /** Lowpass cutoff of the drone. */
  warmth: number;
}

export const MUSIC: Record<BiomeId | 'title', MusicTheme> = {
  title: {
    root: 55,
    scale: [0, 3, 7, 10, 12, 15],
    bpm: 56,
    density: 0.5,
    lead: 'sine',
    warmth: 500,
  },
  // Crypte : mineur naturel, lent et creux.
  crypt: {
    root: 55,
    scale: [0, 2, 3, 7, 8, 12],
    bpm: 64,
    density: 0.45,
    lead: 'triangle',
    warmth: 420,
  },
  // Forêt corrompue : dorien, plus aérien.
  forest: {
    root: 61.74,
    scale: [0, 2, 3, 7, 9, 12],
    bpm: 76,
    density: 0.55,
    lead: 'sine',
    warmth: 700,
  },
  // Forge : phrygien, pulsé et sombre.
  forge: {
    root: 49,
    scale: [0, 1, 5, 7, 8, 12],
    bpm: 92,
    density: 0.6,
    lead: 'sawtooth',
    warmth: 900,
  },
};

export const MUSIC_MIX = {
  /** Overall music level before the player's volume setting. */
  level: 0.16,
  /** Extra pulse added during locked-door fights (0..1 intensity). */
  combatPulse: 0.7,
  /** Seconds to cross-fade between themes. */
  fade: 2,
} as const;
