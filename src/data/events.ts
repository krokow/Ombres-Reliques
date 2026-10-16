/**
 * Random floor events (seeded per floor). Each picks a combat room and
 * changes what happens there: a second wave, a trapped chest, a fountain,
 * a timed rift, a wandering merchant.
 */
export type FloorEventKind = 'ambush' | 'mimic' | 'fountain' | 'rift' | 'merchant';

export const FLOOR_EVENTS = {
  /** Events per floor: [min, max]; floor 1 always has exactly one. */
  perFloor: [1, 2] as const,
  pool: [
    { kind: 'ambush', weight: 3, minFloor: 1 },
    { kind: 'mimic', weight: 2, minFloor: 2 },
    { kind: 'fountain', weight: 3, minFloor: 1 },
    { kind: 'rift', weight: 2, minFloor: 2 },
    { kind: 'merchant', weight: 2, minFloor: 1 },
  ] satisfies { kind: FloorEventKind; weight: number; minFloor: number }[],
  ambush: {
    /** Second wave size: base + one per this many floors; one elite guaranteed. */
    base: 3,
    floorsPerExtra: 3,
    rewardGold: [30, 60] as const,
  },
  rift: {
    /** Clear the room within this many ticks to open the rift's chest. */
    timeTicks: 60 * 30,
    extraEnemies: 2,
  },
  merchant: { discount: 0.35, offers: 3 },
  fountain: {
    outcomes: [
      { id: 'heal', weight: 4 },
      { id: 'blessing', weight: 3 },
      { id: 'gold', weight: 2 },
      { id: 'guarded', weight: 2 },
    ] as const,
    healFraction: 0.5,
    blessingTicks: 60 * 45,
    gold: [40, 90] as const,
    guardians: 3,
  },
} as const;

export const EVENT_TEXT: Record<FloorEventKind, string> = {
  ambush: 'Embuscade !',
  mimic: 'Le coffre avait des dents…',
  fountain: 'Fontaine ancienne',
  rift: 'Une faille s’ouvre : éliminez tout en 30 s !',
  merchant: 'Un marchand ambulant s’installe',
};
