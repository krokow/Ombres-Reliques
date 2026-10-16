import type { BiomeId } from './biomes';
import type { StatusApplication } from './statuses';

/**
 * Floor traps: cycle idle → warning (telegraphed) → active. They hurt
 * everyone, so luring enemies onto them is a strategy (their kills count
 * for the party).
 */
export interface HazardDef {
  name: string;
  /** Full cycle length, then the warning and active windows at its end. */
  periodTicks: number;
  warnTicks: number;
  activeTicks: number;
  radius: number;
  damage: number;
  knockback: number;
  statuses: readonly StatusApplication[];
}

export const HAZARDS = {
  spikes: {
    name: 'Pics',
    periodTicks: 160,
    warnTicks: 34,
    activeTicks: 18,
    radius: 15,
    damage: 10,
    knockback: 80,
    statuses: [],
  },
  snare: {
    name: 'Ronces',
    periodTicks: 190,
    warnTicks: 36,
    activeTicks: 24,
    radius: 17,
    damage: 6,
    knockback: 0,
    statuses: [{ id: 'slow', ticks: 90 }],
  },
  vent: {
    name: 'Bouche de feu',
    periodTicks: 200,
    warnTicks: 44,
    activeTicks: 28,
    radius: 22,
    damage: 12,
    knockback: 140,
    statuses: [{ id: 'burn', ticks: 60 }],
  },
} as const satisfies Record<string, HazardDef>;

export type HazardId = keyof typeof HAZARDS;

export const HAZARD_PLACEMENT = {
  byBiome: { crypt: 'spikes', forest: 'snare', forge: 'vent' } satisfies Record<BiomeId, HazardId>,
  /** Traps per combat room: up to min(max, base + floor / perFloors). */
  base: 1,
  perFloors: 3,
  max: 4,
  /** Chance that a combat room has traps at all. */
  roomChance: 0.6,
  /** Keep clear of doors and the room centre (props, spawn). */
  doorClearance: 3,
  centerClearance: 2,
} as const;
