import type { FlagId, Mods } from './progression';

/** Loot tuning. Values are fractions where they read as percentages. */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ItemSlot = 'weapon' | 'armor' | 'relic';

export const RARITIES: Record<
  Rarity,
  { name: string; weight: number; affixes: number; statMult: number; value: number; color: string }
> = {
  common: { name: 'Commun', weight: 60, affixes: 0, statMult: 1, value: 6, color: '#cfcfd6' },
  rare: { name: 'Rare', weight: 28, affixes: 1, statMult: 1.2, value: 16, color: '#4da6ff' },
  epic: { name: 'Épique', weight: 10, affixes: 2, statMult: 1.45, value: 40, color: '#b36bff' },
  legendary: {
    name: 'Légendaire',
    weight: 2,
    affixes: 3,
    statMult: 1.8,
    value: 100,
    color: '#ffb347',
  },
};

export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Deeper floors shift weights towards better rarities: weight × (1 + boost × (floor − 1)). */
export const RARITY_FLOOR_BOOST: Record<Rarity, number> = {
  common: 0,
  rare: 0.2,
  epic: 0.35,
  legendary: 0.5,
};

export const ITEM_BASES: Record<ItemSlot, { names: readonly string[]; label: string }> = {
  weapon: {
    label: 'Arme',
    names: [
      'Lame runique',
      'Masse cloutée',
      'Bâton de saule',
      'Crochet d’os',
      'Éclat de lune',
      'Fléau rouillé',
    ],
  },
  armor: {
    label: 'Armure',
    names: [
      'Cuir tanné',
      'Brigandine',
      'Robe tissée',
      'Écailles noires',
      'Mailles d’argent',
      'Manteau de cendre',
    ],
  },
  relic: {
    label: 'Relique',
    names: [
      'Amulette fêlée',
      'Talisman de corne',
      'Anneau terni',
      'Breloque d’ambre',
      'Sceau oublié',
    ],
  },
};

/** Implicit stat of each slot: base + perLevel × item level, × rarity multiplier. */
export const SLOT_IMPLICIT: Record<
  ItemSlot,
  readonly { stat: keyof Mods; base: number; perLevel: number }[]
> = {
  weapon: [{ stat: 'damagePct', base: 0.05, perLevel: 0.012 }],
  armor: [
    { stat: 'maxHpPct', base: 0.06, perLevel: 0.012 },
    { stat: 'damageReduction', base: 0.02, perLevel: 0.004 },
  ],
  relic: [],
};

export interface AffixDef {
  stat: keyof Mods;
  min: number;
  max: number;
  /** Rounded to whole numbers (charges). */
  integer?: boolean;
  /** Only from this rarity up. */
  minRarity?: Rarity;
  weight: number;
}

export const AFFIXES: readonly AffixDef[] = [
  { stat: 'damagePct', min: 0.03, max: 0.08, weight: 10 },
  { stat: 'critChance', min: 0.02, max: 0.05, weight: 8 },
  { stat: 'maxHpPct', min: 0.04, max: 0.1, weight: 10 },
  { stat: 'cooldownPct', min: 0.03, max: 0.07, weight: 6 },
  { stat: 'lifesteal', min: 0.01, max: 0.03, weight: 5 },
  { stat: 'moveSpeedPct', min: 0.02, max: 0.06, weight: 6 },
  { stat: 'energyGainPct', min: 0.08, max: 0.2, weight: 6 },
  { stat: 'damageReduction', min: 0.02, max: 0.05, weight: 6 },
  { stat: 'goldPct', min: 0.1, max: 0.25, weight: 4 },
  { stat: 'extraDashCharges', min: 1, max: 1, integer: true, minRarity: 'epic', weight: 2 },
];

/** How each stat reads in the UI. */
export const STAT_LABELS: Partial<Record<keyof Mods, { label: string; percent: boolean }>> = {
  damagePct: { label: 'dégâts', percent: true },
  critChance: { label: 'critique', percent: true },
  maxHpPct: { label: 'PV max', percent: true },
  cooldownPct: { label: 'recharge', percent: true },
  lifesteal: { label: 'vol de vie', percent: true },
  moveSpeedPct: { label: 'vitesse', percent: true },
  energyGainPct: { label: 'énergie', percent: true },
  damageReduction: { label: 'réduction des dégâts', percent: true },
  goldPct: { label: 'or trouvé', percent: true },
  extraDashCharges: { label: 'charge de mobilité', percent: false },
};

// ---------------------------------------------------------------- global relics & curses

export interface RelicDef {
  name: string;
  desc: string;
  curse?: boolean;
  mods?: Partial<Mods>;
  flag?: FlagId;
  color: string;
}

/** Party-wide relics (several interact with invisibility and switching) and curses. */
export const RELICS = {
  shadowCloak: {
    name: 'Cape d’ombre',
    desc: '+30 % de dégâts tant que vous êtes invisible',
    flag: 'shadowCloak',
    color: '#9b7bff',
  },
  brokenHourglass: {
    name: 'Sablier fêlé',
    desc: 'Switch : cooldown et verrou −40 %',
    flag: 'brokenHourglass',
    color: '#e0c06a',
  },
  relayTotem: {
    name: 'Totem du relais',
    desc: 'Entrer en jeu donne +25 % de dégâts pendant 2 s',
    flag: 'relayTotem',
    color: '#ff8a3d',
  },
  sharedHeart: {
    name: 'Cœur partagé',
    desc: 'La réserve se soigne 2,5× plus vite',
    flag: 'sharedHeart',
    color: '#ff4d6d',
  },
  bloodstone: {
    name: 'Pierre de sang',
    desc: 'Chaque kill rend 3 PV',
    flag: 'bloodstone',
    color: '#c43c5a',
  },
  huntersEye: {
    name: 'Œil du chasseur',
    desc: '+20 % de dégâts sur les cibles marquées',
    flag: 'huntersEye',
    color: '#d38bff',
  },
  goldenTooth: {
    name: 'Dent d’or',
    desc: '+50 % d’or trouvé',
    mods: { goldPct: 0.5 },
    color: '#ffd34d',
  },
  lantern: {
    name: 'Lanterne des profondeurs',
    desc: 'Chaque étage est révélé sur la carte',
    flag: 'lantern',
    color: '#fff3c4',
  },
  phoenixFeather: {
    name: 'Plume de phénix',
    desc: 'Le premier KO de chaque étage est annulé (30 % PV)',
    flag: 'phoenixFeather',
    color: '#ffb347',
  },
  // Curses
  frailty: {
    name: 'Malédiction : fragilité',
    desc: '−15 % PV max pour toute l’équipe',
    curse: true,
    mods: { maxHpPct: -0.15 },
    color: '#7a2f3c',
  },
  hunted: {
    name: 'Malédiction : traque',
    desc: 'Les ennemis infligent +20 % de dégâts',
    curse: true,
    flag: 'hunted',
    color: '#7a2f3c',
  },
  poverty: {
    name: 'Malédiction : disette',
    desc: '−40 % d’or trouvé',
    curse: true,
    mods: { goldPct: -0.4 },
    color: '#7a2f3c',
  },
} as const satisfies Record<string, RelicDef>;

export type RelicId = keyof typeof RELICS;

export function isCurse(id: RelicId): boolean {
  return (RELICS[id] as RelicDef).curse === true;
}

// ---------------------------------------------------------------- consumables

export const CONSUMABLES = {
  potion: { name: 'Potion de vie', short: 'Potion', heal: 0.4, color: '#ff4d6d' },
  bomb: {
    name: 'Bombe',
    short: 'Bombe',
    damage: 40,
    radius: 70,
    range: 220,
    fuseTicks: 30,
    color: '#9aa0b4',
  },
  thunder: {
    name: 'Parchemin de foudre',
    short: 'Foudre',
    damage: 35,
    radius: 260,
    stunTicks: 40,
    color: '#ffe14d',
  },
} as const;

export type ConsumableId = keyof typeof CONSUMABLES;

export const LOOT = {
  quickSlots: 2,
  maxStack: 3,
  startingKeys: 1,
  /** Gold per kill = xp × goldPerXp (± 30 %). */
  goldPerXp: 0.5,
  /** Coins fly to the player inside this radius. */
  magnetRadius: 80,
  pickupRadius: 18,
  /** Item & relic pickups show their comparison / prompt within this radius. */
  inspectRadius: 40,
  interactRadius: 56,
  drops: {
    normal: { item: 0.03, consumable: 0.06, key: 0.025 },
    elite: { item: 0.3, consumable: 0.15, key: 0.08 },
  },
  chest: { gold: [25, 55] as const, minRarity: 'rare' as Rarity },
  /** Shop prices: items = salvage value × itemMult, others fixed; × (1 + perFloor × (floor − 1)). */
  shop: { itemMult: 3, potion: 25, bomb: 30, thunder: 40, key: 35, relic: 120, perFloor: 0.15 },
  altar: { sacrificeMaxHpPct: 0.15 },
  /** Salvage value grows with item level. */
  valuePerLevel: 0.2,
} as const;
