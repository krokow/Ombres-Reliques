import type { ClassId } from './classes';
import type { RelicId } from './items';

/**
 * Meta progression (M8): "Éclats" earned at the end of every run buy
 * unlocks (classes, relic packs) and a few light permanent upgrades.
 * Upgrades stay small on purpose: skill decides runs, not grinding.
 */

/** Run-wide bonuses granted by permanent upgrades (stored with the run). */
export interface RunBonuses {
  maxHpPct: number;
  startGold: number;
  startPotions: number;
  /** Added to the fraction of HP KO'd members come back with between floors. */
  reviveBonus: number;
}

export const NO_BONUSES: RunBonuses = {
  maxHpPct: 0,
  startGold: 0,
  startPotions: 0,
  reviveBonus: 0,
};

export const META = {
  currency: 'Éclats',
  /** Shards earned at the end of a run. */
  rewards: {
    perFloorCleared: 4,
    perMiniboss: 8,
    perBoss: 20,
    victory: 40,
    /** One shard per this many kills. */
    killsPerShard: 15,
    /** Daily runs pay a bit more (one honest attempt a day). */
    dailyMult: 1.5,
  },
  startingClasses: ['shadowBlade', 'guardian', 'arcanist'] satisfies ClassId[],
  /** Runs kept in the history. */
  historySize: 20,
} as const;

export type UnlockDef =
  | { id: string; kind: 'class'; classId: ClassId; name: string; desc: string; cost: number }
  | {
      id: string;
      kind: 'relics';
      relics: readonly RelicId[];
      name: string;
      desc: string;
      cost: number;
      requires?: string;
    };

export const UNLOCKS: readonly UnlockDef[] = [
  {
    id: 'class:summoner',
    kind: 'class',
    classId: 'summoner',
    name: 'Invocateur',
    desc: 'Feux-follets, fouet d’âme et colosse d’os',
    cost: 40,
  },
  {
    id: 'class:berserker',
    kind: 'class',
    classId: 'berserker',
    name: 'Berserker',
    desc: 'Rage, tourbillon et frénésie',
    cost: 40,
  },
  {
    id: 'relics:1',
    kind: 'relics',
    relics: ['phoenixFeather', 'sharedHeart', 'relayTotem'],
    name: 'Reliquaire I',
    desc: 'Plume de phénix, Cœur partagé, Totem du relais',
    cost: 25,
  },
  {
    id: 'relics:2',
    kind: 'relics',
    relics: ['lantern', 'goldenTooth', 'huntersEye'],
    name: 'Reliquaire II',
    desc: 'Lanterne, Dent d’or, Œil du chasseur',
    cost: 35,
    requires: 'relics:1',
  },
];

export interface UpgradeDef {
  id: string;
  name: string;
  /** Description of one rank. */
  desc: string;
  costs: readonly number[];
  perRank: Partial<RunBonuses>;
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'vitality',
    name: 'Vigueur ancestrale',
    desc: '+5 % PV max pour toute l’équipe',
    costs: [15, 30, 50],
    perRank: { maxHpPct: 0.05 },
  },
  {
    id: 'purse',
    name: 'Bourse',
    desc: '+20 or au départ',
    costs: [10, 20, 35],
    perRank: { startGold: 20 },
  },
  {
    id: 'satchel',
    name: 'Besace',
    desc: 'Une potion de vie au départ',
    costs: [25],
    perRank: { startPotions: 1 },
  },
  {
    id: 'resolve',
    name: 'Résolution',
    desc: '+10 % de PV pour les KO réanimés entre deux étages',
    costs: [20, 40],
    perRank: { reviveBonus: 0.1 },
  },
];

export function unlockById(id: string): UnlockDef | undefined {
  return UNLOCKS.find((u) => u.id === id);
}

export function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}
