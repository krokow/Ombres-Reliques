import type { ClassId } from './classes';

/**
 * Numeric modifiers a character accumulates from cards and talents.
 * Percentages are fractions (0.1 = +10 %). Everything defaults to 0.
 */
export interface Mods {
  maxHpPct: number;
  damagePct: number;
  critChance: number;
  moveSpeedPct: number;
  /** Reduces every cooldown (and dash recharge). */
  cooldownPct: number;
  skillCooldownPct: number;
  primaryCooldownPct: number;
  dashRechargePct: number;
  extraDashCharges: number;
  energyGainPct: number;
  lifesteal: number;
  backstabBonus: number;
  veilDurationPct: number;
  parryWindowBonus: number;
  blockReductionBonus: number;
  shieldCapBonus: number;
  regenCapBonus: number;
  tauntShieldBonus: number;
  slowDurationPct: number;
  slowedBonus: number;
  extraMeteors: number;
  maxManaFlat: number;
  manaRegenPct: number;
  /** Fraction of incoming damage removed (capped). */
  damageReduction: number;
  goldPct: number;
  minionDamagePct: number;
  minionLifePct: number;
  maxMinionsBonus: number;
  rageGainPct: number;
  /** Fraction of rage decay removed. */
  rageDecayReduction: number;
}

/** Behaviour switches unlocked by evolution cards and talent capstones. */
export type FlagId =
  // Lame d'Ombre
  | 'shurikenFan'
  | 'lingeringVeil'
  | 'bladeDance'
  | 'killStealth'
  | 'deathMark'
  | 'fullReset'
  // Gardien
  | 'thorns'
  | 'earthshaker'
  | 'parryNova'
  | 'chargeReset'
  | 'rally'
  // Arcaniste
  | 'wildfire'
  | 'shatter'
  | 'frostBlink'
  | 'meteorFire'
  | 'twinBolt'
  // Invocateur
  | 'soulfire'
  | 'soulStorm'
  | 'graveHarvest'
  | 'soulLink'
  | 'twinColossus'
  // Berserker
  | 'twinAxes'
  | 'maelstrom'
  | 'execute'
  | 'endlessFrenzy'
  | 'leapStun'
  // Global relics / curses (M6)
  | 'shadowCloak'
  | 'brokenHourglass'
  | 'relayTotem'
  | 'sharedHeart'
  | 'bloodstone'
  | 'huntersEye'
  | 'lantern'
  | 'phoenixFeather'
  | 'hunted';

export interface CardDef {
  id: string;
  name: string;
  desc: string;
  /** null = any class. */
  classId: ClassId | null;
  minLevel: number;
  maxStacks: number;
  weight: number;
  /** Evolutions change how a skill works (highlighted in the UI). */
  evolution?: boolean;
  mods?: Partial<Mods>;
  flag?: FlagId;
}

export interface TalentNode {
  id: string;
  name: string;
  desc: string;
  mods?: Partial<Mods>;
  flag?: FlagId;
}

export interface TalentBranch {
  name: string;
  /** Tiers must be bought in order. */
  nodes: readonly TalentNode[];
}

export const PROGRESSION = {
  maxLevel: 20,
  /** XP needed to go from `level` to `level + 1`: round(base × level^exponent). */
  xpCurve: { base: 40, exponent: 1.35 },
  /** Reserve members earn this fraction of kill XP (KO'd ones earn nothing). */
  reserveXpRate: 0.4,
  eliteXpMult: 2.5,
  championXpMult: 5,
  /** One talent point every N levels. */
  talentPointEvery: 3,
  cardsPerOffer: 3,
} as const;

export const CARDS: readonly CardDef[] = [
  // --- Any class
  {
    id: 'vigor',
    name: 'Vigueur',
    desc: '+12 % PV max',
    classId: null,
    minLevel: 1,
    maxStacks: 5,
    weight: 10,
    mods: { maxHpPct: 0.12 },
  },
  {
    id: 'might',
    name: 'Puissance',
    desc: '+8 % dégâts',
    classId: null,
    minLevel: 1,
    maxStacks: 5,
    weight: 10,
    mods: { damagePct: 0.08 },
  },
  {
    id: 'precision',
    name: 'Précision',
    desc: '+5 % chance de critique',
    classId: null,
    minLevel: 1,
    maxStacks: 4,
    weight: 8,
    mods: { critChance: 0.05 },
  },
  {
    id: 'swiftness',
    name: 'Célérité',
    desc: '+6 % vitesse',
    classId: null,
    minLevel: 1,
    maxStacks: 3,
    weight: 6,
    mods: { moveSpeedPct: 0.06 },
  },
  {
    id: 'focus',
    name: 'Concentration',
    desc: '−8 % temps de recharge',
    classId: null,
    minLevel: 2,
    maxStacks: 3,
    weight: 7,
    mods: { cooldownPct: 0.08 },
  },
  {
    id: 'zeal',
    name: 'Ferveur',
    desc: '+20 % gain d’énergie',
    classId: null,
    minLevel: 2,
    maxStacks: 3,
    weight: 6,
    mods: { energyGainPct: 0.2 },
  },
  {
    id: 'leech',
    name: 'Sangsue',
    desc: '3 % des dégâts infligés soignent',
    classId: null,
    minLevel: 3,
    maxStacks: 3,
    weight: 5,
    mods: { lifesteal: 0.03 },
  },
  // --- Lame d'Ombre
  {
    id: 'shurikenFan',
    name: 'Éventail',
    desc: 'Le shuriken part en éventail de 3',
    classId: 'shadowBlade',
    minLevel: 2,
    maxStacks: 1,
    weight: 7,
    flag: 'shurikenFan',
  },
  {
    id: 'lingeringVeil',
    name: 'Brume tenace',
    desc: 'Voile +50 % de durée, soigne 3 PV/s',
    classId: 'shadowBlade',
    minLevel: 3,
    maxStacks: 1,
    weight: 7,
    flag: 'lingeringVeil',
    mods: { veilDurationPct: 0.5 },
  },
  {
    id: 'bladeDance',
    name: 'Danse des lames',
    desc: 'ÉVOLUTION — le dash laisse une traînée qui blesse',
    classId: 'shadowBlade',
    minLevel: 5,
    maxStacks: 1,
    weight: 9,
    evolution: true,
    flag: 'bladeDance',
  },
  // --- Gardien
  {
    id: 'thorns',
    name: 'Épines',
    desc: 'Bloquer renvoie 50 % des dégâts bloqués',
    classId: 'guardian',
    minLevel: 2,
    maxStacks: 1,
    weight: 7,
    flag: 'thorns',
  },
  {
    id: 'bulwark',
    name: 'Rempart vivant',
    desc: 'Bouclier max +40, régénération jusqu’à +20',
    classId: 'guardian',
    minLevel: 3,
    maxStacks: 1,
    weight: 7,
    mods: { shieldCapBonus: 40, regenCapBonus: 20 },
  },
  {
    id: 'earthshaker',
    name: 'Séisme',
    desc: 'ÉVOLUTION — la charge finit par une onde de choc',
    classId: 'guardian',
    minLevel: 5,
    maxStacks: 1,
    weight: 9,
    evolution: true,
    flag: 'earthshaker',
  },
  // --- Arcaniste
  {
    id: 'manaFont',
    name: 'Source de mana',
    desc: '+40 % régénération de mana',
    classId: 'arcanist',
    minLevel: 2,
    maxStacks: 2,
    weight: 7,
    mods: { manaRegenPct: 0.4 },
  },
  {
    id: 'wildfire',
    name: 'Feu sauvage',
    desc: 'Brasier +40 % de rayon, +50 % de durée',
    classId: 'arcanist',
    minLevel: 3,
    maxStacks: 1,
    weight: 7,
    flag: 'wildfire',
  },
  {
    id: 'shatter',
    name: 'Fracture',
    desc: 'ÉVOLUTION — le givre fige les cibles déjà ralenties',
    classId: 'arcanist',
    minLevel: 5,
    maxStacks: 1,
    weight: 9,
    evolution: true,
    flag: 'shatter',
  },
  // --- Invocateur
  {
    id: 'swarm',
    name: 'Essaim',
    desc: '+1 feu-follet maximum',
    classId: 'summoner',
    minLevel: 2,
    maxStacks: 2,
    weight: 7,
    mods: { maxMinionsBonus: 1 },
  },
  {
    id: 'soulfire',
    name: 'Âmes ardentes',
    desc: 'Invocations +25 % de dégâts, leurs coups brûlent',
    classId: 'summoner',
    minLevel: 3,
    maxStacks: 1,
    weight: 7,
    flag: 'soulfire',
    mods: { minionDamagePct: 0.25 },
  },
  {
    id: 'soulStorm',
    name: 'Tempête d’âmes',
    desc: 'ÉVOLUTION — les feux-follets explosent quand ils s’éteignent',
    classId: 'summoner',
    minLevel: 5,
    maxStacks: 1,
    weight: 9,
    evolution: true,
    flag: 'soulStorm',
  },
  // --- Berserker
  {
    id: 'bloodlust',
    name: 'Soif de sang',
    desc: '+40 % de rage gagnée',
    classId: 'berserker',
    minLevel: 2,
    maxStacks: 2,
    weight: 7,
    mods: { rageGainPct: 0.4 },
  },
  {
    id: 'twinAxes',
    name: 'Haches jumelles',
    desc: 'Le jet lance deux haches en V',
    classId: 'berserker',
    minLevel: 3,
    maxStacks: 1,
    weight: 7,
    flag: 'twinAxes',
  },
  {
    id: 'maelstrom',
    name: 'Maelström',
    desc: 'ÉVOLUTION — le Tourbillon aspire les ennemis et dure +50 %',
    classId: 'berserker',
    minLevel: 5,
    maxStacks: 1,
    weight: 9,
    evolution: true,
    flag: 'maelstrom',
  },
];

export const TALENTS: Record<ClassId, readonly TalentBranch[]> = {
  shadowBlade: [
    {
      name: 'Furtivité',
      nodes: [
        {
          id: 'sb-f1',
          name: 'Fumigène',
          desc: 'Voile : −20 % de recharge',
          mods: { skillCooldownPct: 0.2 },
        },
        {
          id: 'sb-f2',
          name: 'Brouillard',
          desc: 'Voile : +30 % de durée',
          mods: { veilDurationPct: 0.3 },
        },
        {
          id: 'sb-f3',
          name: 'Pas de l’ombre',
          desc: 'Chaque kill rend invisible 1 s',
          flag: 'killStealth',
        },
      ],
    },
    {
      name: 'Burst',
      nodes: [
        {
          id: 'sb-b1',
          name: 'Lame vicieuse',
          desc: 'Dos : +30 % de multiplicateur',
          mods: { backstabBonus: 0.3 },
        },
        { id: 'sb-b2', name: 'Œil du tueur', desc: '+8 % de critique', mods: { critChance: 0.08 } },
        {
          id: 'sb-b3',
          name: 'Marque de mort',
          desc: 'Exécution : bonus sur cibles blessées ×2',
          flag: 'deathMark',
        },
      ],
    },
    {
      name: 'Mobilité',
      nodes: [
        {
          id: 'sb-m1',
          name: 'Pieds légers',
          desc: 'Dash : −20 % de recharge',
          mods: { dashRechargePct: 0.2 },
        },
        {
          id: 'sb-m2',
          name: 'Double pas',
          desc: '+1 charge de dash',
          mods: { extraDashCharges: 1 },
        },
        {
          id: 'sb-m3',
          name: 'Reset total',
          desc: 'Un kill recharge tous les dashs',
          flag: 'fullReset',
        },
      ],
    },
  ],
  guardian: [
    {
      name: 'Rempart',
      nodes: [
        { id: 'gd-r1', name: 'Carrure', desc: '+15 % PV max', mods: { maxHpPct: 0.15 } },
        {
          id: 'gd-r2',
          name: 'Garde parfaite',
          desc: 'Parade : +5 ticks de fenêtre, blocage +10 %',
          mods: { parryWindowBonus: 5, blockReductionBonus: 0.1 },
        },
        {
          id: 'gd-r3',
          name: 'Contre-choc',
          desc: 'Une parade déclenche une onde de choc',
          flag: 'parryNova',
        },
      ],
    },
    {
      name: 'Châtiment',
      nodes: [
        { id: 'gd-c1', name: 'Bras lourd', desc: '+10 % dégâts', mods: { damagePct: 0.1 } },
        { id: 'gd-c2', name: 'Coup précis', desc: '+8 % de critique', mods: { critChance: 0.08 } },
        { id: 'gd-c3', name: 'Élan', desc: 'Un kill recharge la charge', flag: 'chargeReset' },
      ],
    },
    {
      name: 'Commandement',
      nodes: [
        {
          id: 'gd-k1',
          name: 'Voix forte',
          desc: 'Provocation : −25 % de recharge',
          mods: { skillCooldownPct: 0.25 },
        },
        {
          id: 'gd-k2',
          name: 'Défi',
          desc: 'Provocation : +20 de bouclier',
          mods: { tauntShieldBonus: 20 },
        },
        {
          id: 'gd-k3',
          name: 'Ralliement',
          desc: 'Bastion soigne la réserve de 25 %',
          flag: 'rally',
        },
      ],
    },
  ],
  arcanist: [
    {
      name: 'Givre',
      nodes: [
        {
          id: 'ar-g1',
          name: 'Froid mordant',
          desc: 'Ralentissements +50 % de durée',
          mods: { slowDurationPct: 0.5 },
        },
        {
          id: 'ar-g2',
          name: 'Engelure',
          desc: 'Passif : +15 % sur cibles ralenties',
          mods: { slowedBonus: 0.15 },
        },
        {
          id: 'ar-g3',
          name: 'Sillage glacé',
          desc: 'Le blink laisse une nova blessante et plus large',
          flag: 'frostBlink',
        },
      ],
    },
    {
      name: 'Feu',
      nodes: [
        {
          id: 'ar-f1',
          name: 'Combustion',
          desc: 'Brasier : −25 % de recharge',
          mods: { skillCooldownPct: 0.25 },
        },
        { id: 'ar-f2', name: 'Averse', desc: '+3 météores', mods: { extraMeteors: 3 } },
        {
          id: 'ar-f3',
          name: 'Cratères',
          desc: 'Chaque météore laisse un petit brasier',
          flag: 'meteorFire',
        },
      ],
    },
    {
      name: 'Arcane',
      nodes: [
        { id: 'ar-a1', name: 'Réservoir', desc: '+30 mana max', mods: { maxManaFlat: 30 } },
        {
          id: 'ar-a2',
          name: 'Débit',
          desc: 'Traits : −15 % de recharge',
          mods: { primaryCooldownPct: 0.15 },
        },
        {
          id: 'ar-a3',
          name: 'Traits jumeaux',
          desc: 'Un trait sur deux est surchargé',
          flag: 'twinBolt',
        },
      ],
    },
  ],
  summoner: [
    {
      name: 'Nuée',
      nodes: [
        {
          id: 'sm-n1',
          name: 'Appel',
          desc: 'Feux-follets : −25 % de recharge',
          mods: { skillCooldownPct: 0.25 },
        },
        {
          id: 'sm-n2',
          name: 'Cortège',
          desc: '+1 feu-follet maximum',
          mods: { maxMinionsBonus: 1 },
        },
        {
          id: 'sm-n3',
          name: 'Moisson',
          desc: 'Chaque kill proche relève un feu-follet',
          flag: 'graveHarvest',
        },
      ],
    },
    {
      name: 'Lien',
      nodes: [
        {
          id: 'sm-l1',
          name: 'Ancrage',
          desc: 'Invocations : +30 % de durée',
          mods: { minionLifePct: 0.3 },
        },
        {
          id: 'sm-l2',
          name: 'Ferveur',
          desc: 'Invocations : +20 % de dégâts',
          mods: { minionDamagePct: 0.2 },
        },
        {
          id: 'sm-l3',
          name: 'Lien vital',
          desc: 'Chaque coup d’invocation soigne l’actif de 1 PV',
          flag: 'soulLink',
        },
      ],
    },
    {
      name: 'Os',
      nodes: [
        { id: 'sm-o1', name: 'Os denses', desc: '+15 % PV max', mods: { maxHpPct: 0.15 } },
        {
          id: 'sm-o2',
          name: 'Carapace',
          desc: '−10 % de dégâts subis',
          mods: { damageReduction: 0.1 },
        },
        {
          id: 'sm-o3',
          name: 'Jumeaux d’os',
          desc: 'L’ultime relève deux colosses',
          flag: 'twinColossus',
        },
      ],
    },
  ],
  berserker: [
    {
      name: 'Carnage',
      nodes: [
        { id: 'bz-c1', name: 'Tranchant', desc: '+10 % dégâts', mods: { damagePct: 0.1 } },
        { id: 'bz-c2', name: 'Fendoir', desc: '+8 % de critique', mods: { critChance: 0.08 } },
        {
          id: 'bz-c3',
          name: 'Coup de grâce',
          desc: 'Achève les ennemis sous 12 % PV (hors boss)',
          flag: 'execute',
        },
      ],
    },
    {
      name: 'Rage',
      nodes: [
        { id: 'bz-r1', name: 'Bile', desc: '+30 % de rage gagnée', mods: { rageGainPct: 0.3 } },
        {
          id: 'bz-r2',
          name: 'Colère froide',
          desc: 'La rage décroît deux fois moins vite',
          mods: { rageDecayReduction: 0.5 },
        },
        {
          id: 'bz-r3',
          name: 'Sans fin',
          desc: 'Chaque kill en Frénésie la prolonge de 1 s',
          flag: 'endlessFrenzy',
        },
      ],
    },
    {
      name: 'Bond',
      nodes: [
        {
          id: 'bz-b1',
          name: 'Jarrets',
          desc: 'Bond : −20 % de recharge',
          mods: { dashRechargePct: 0.2 },
        },
        { id: 'bz-b2', name: 'Rebond', desc: '+1 charge de Bond', mods: { extraDashCharges: 1 } },
        {
          id: 'bz-b3',
          name: 'Impact',
          desc: 'L’atterrissage du Bond étourdit',
          flag: 'leapStun',
        },
      ],
    },
  ],
};

export function cardById(id: string): CardDef | undefined {
  return CARDS.find((c) => c.id === id);
}

export function talentById(
  classId: ClassId,
  id: string,
): { branch: number; tier: number; node: TalentNode } | null {
  const branches = TALENTS[classId];
  for (let b = 0; b < branches.length; b++) {
    const nodes = branches[b]?.nodes ?? [];
    for (let t = 0; t < nodes.length; t++) {
      const node = nodes[t];
      if (node?.id === id) return { branch: b, tier: t, node };
    }
  }
  return null;
}

export function xpToNext(level: number): number {
  return Math.round(PROGRESSION.xpCurve.base * level ** PROGRESSION.xpCurve.exponent);
}
