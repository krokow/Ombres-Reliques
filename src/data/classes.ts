import type { DashDef, MeleeHitDef, MoverDef, ProjectileDef } from './types';

/** Fields every playable class has. Kit-specific fields live in each class interface. */
interface ClassBase {
  name: string;
  role: string;
  maxHp: number;
  radius: number;
  /** Body weight: resists crowd pushing and divides received knockback. */
  weight: number;
  mover: MoverDef;
  /** Movement multiplier while attacking. */
  attackMoveFactor: number;
  /** Mobility skill (Space): dash, charge or blink. Charges/recharge are shared mechanics. */
  dash: DashDef;
  critChance: number;
  critMultiplier: number;
  maxEnergy: number;
  energyOnKill: number;
  /** Energy gained per point of damage dealt (the ultimate fills from kills AND damage). */
  energyPerDamage: number;
  /** Energy gained per point of damage taken (tanks). */
  energyPerDamageTaken: number;
  /** I-frames after taking a hit. */
  hurtInvulnTicks: number;
  palette: { body: string; trim: string; eyes: string };
  /** HUD names of the five actions. */
  labels: { primary: string; secondary: string; mobility: string; skill: string; ultimate: string };
}

export interface ShadowBladeDef extends ClassBase {
  id: 'shadowBlade';
  combo: readonly MeleeHitDef[];
  /** Ticks after the last combo hit before the combo resets to its first hit. */
  comboResetTicks: number;
  ranged: ProjectileDef;
  /** Damage multiplier when hitting a target from behind. */
  backstabMultiplier: number;
  /** Active skill on the "A" key (physical KeyQ). */
  veil: {
    cooldownTicks: number;
    radius: number;
    durationTicks: number;
    /** Duration of the guaranteed-crit window granted when leaving the veil. */
    ambushTicks: number;
  };
  /** Passive: backstabs mark the target. */
  passive: { markTicks: number };
  /** Ultimate on "R": chain of teleport strikes. */
  ultimate: {
    energyCost: number;
    maxTargets: number;
    radius: number;
    hopTicks: number;
    damage: number;
    /** Damage × (1 + lowHpBonus × missing HP fraction). */
    lowHpBonus: number;
    knockback: number;
    stagger: number;
    /** I-frames kept after the last hop. */
    endInvulnTicks: number;
  };
  /** Switch-in: arrives unseen, first strike is a crit. */
  entry: { invisibleTicks: number; ambushTicks: number };
}

export interface GuardianDef extends ClassBase {
  id: 'guardian';
  combo: readonly MeleeHitDef[];
  comboResetTicks: number;
  /** Secondary (hold): directional shield. */
  block: {
    /** Total protected arc in front (radians). */
    arc: number;
    /** Fraction of frontal damage removed while blocking. */
    reduction: number;
    /** Blocking this soon before a hit is a perfect parry: no damage, attacker stunned. */
    parryWindowTicks: number;
    parryStunTicks: number;
    parryEnergy: number;
    moveFactor: number;
  };
  /** Mobility: shoulder charge that bowls enemies over. */
  charge: { damage: number; knockback: number; stagger: number; radius: number };
  /** Skill: taunt nearby enemies and gain a shield. */
  taunt: { radius: number; ticks: number; shield: number; cooldownTicks: number };
  /** Ultimate: stunning shockwave + big shield. */
  ultimate: {
    energyCost: number;
    radius: number;
    damage: number;
    knockback: number;
    stunTicks: number;
    shield: number;
  };
  /** Absorb pool cap; the passive regenerates it up to `regenCap` out of combat. */
  shieldCap: number;
  passive: { regenDelayTicks: number; regenPerSecond: number; regenCap: number };
  entry: { radius: number; damage: number; knockback: number; stagger: number; shield: number };
}

export interface ArcanistDef extends ClassBase {
  id: 'arcanist';
  maxMana: number;
  manaRegenPerSecond: number;
  /** Primary: arcane bolts; every Nth bolt is empowered (pierces, hits harder). */
  bolt: ProjectileDef & {
    empowerEvery: number;
    empoweredDamageMult: number;
    empoweredPierce: number;
  };
  /** Secondary: frost orb bursting at the cursor. */
  frostOrb: {
    manaCost: number;
    cooldownTicks: number;
    speed: number;
    maxRange: number;
    radius: number;
    damage: number;
    slowTicks: number;
  };
  /** Mobility: short teleport, frost puff left behind. */
  blink: { distance: number; invulnTicks: number; frostRadius: number; slowTicks: number };
  /** Skill: burning ground at the cursor. */
  firefield: {
    manaCost: number;
    cooldownTicks: number;
    maxRange: number;
    radius: number;
    durationTicks: number;
    burnTicks: number;
  };
  /** Ultimate: meteor shower around the cursor. */
  ultimate: {
    energyCost: number;
    meteors: number;
    spread: number;
    intervalTicks: number;
    /** Telegraph duration of each meteor. */
    fallTicks: number;
    radius: number;
    damage: number;
    knockback: number;
  };
  /** Passive: slowed targets take more damage from the arcanist. */
  passive: { slowedDamageMult: number };
  entry: { radius: number; damage: number; slowTicks: number };
}

export type ClassDef = ShadowBladeDef | GuardianDef | ArcanistDef;

const deg = (d: number): number => (d * Math.PI) / 180;

export const SHADOW_BLADE: ShadowBladeDef = {
  id: 'shadowBlade',
  name: "Lame d'Ombre",
  role: 'Assassin',
  maxHp: 80,
  radius: 11,
  weight: 2.5,
  mover: { moveSpeed: 235, accel: 2600, decel: 3200 },
  attackMoveFactor: 0.35,
  combo: [
    {
      damage: 11,
      range: 46,
      arc: deg(110),
      windupTicks: 2,
      activeTicks: 4,
      recoveryTicks: 9,
      knockback: 140,
      lunge: 220,
      stagger: 6,
    },
    {
      damage: 12,
      range: 48,
      arc: deg(110),
      windupTicks: 2,
      activeTicks: 4,
      recoveryTicks: 9,
      knockback: 160,
      lunge: 240,
      stagger: 6,
    },
    {
      damage: 22,
      range: 56,
      arc: deg(150),
      windupTicks: 5,
      activeTicks: 5,
      recoveryTicks: 16,
      knockback: 380,
      lunge: 340,
      stagger: 22,
    },
  ],
  comboResetTicks: 24,
  ranged: {
    damage: 7,
    speed: 720,
    radius: 5,
    lifetimeTicks: 22,
    knockback: 60,
    pierce: 0,
    cooldownTicks: 26,
    stagger: 2,
  },
  dash: {
    maxCharges: 2,
    rechargeTicks: 75,
    durationTicks: 9,
    speed: 820,
    exitMomentum: 0.6,
    refundOnKill: 1,
  },
  critChance: 0.1,
  critMultiplier: 1.75,
  backstabMultiplier: 1.6,
  maxEnergy: 100,
  energyOnKill: 15,
  energyPerDamage: 0.2,
  energyPerDamageTaken: 0,
  veil: { cooldownTicks: 600, radius: 78, durationTicks: 240, ambushTicks: 150 },
  passive: { markTicks: 240 },
  ultimate: {
    energyCost: 100,
    maxTargets: 5,
    radius: 300,
    hopTicks: 9,
    damage: 26,
    lowHpBonus: 1.5,
    knockback: 120,
    stagger: 30,
    endInvulnTicks: 30,
  },
  hurtInvulnTicks: 40,
  palette: { body: '#241c38', trim: '#9b7bff', eyes: '#7ff6ff' },
  labels: {
    primary: 'Combo',
    secondary: 'Shuriken',
    mobility: 'Dash',
    skill: 'Voile',
    ultimate: 'Exécution',
  },
  entry: { invisibleTicks: 90, ambushTicks: 150 },
};

export const GUARDIAN: GuardianDef = {
  id: 'guardian',
  name: 'Gardien',
  role: 'Tank',
  maxHp: 140,
  radius: 13,
  weight: 4,
  mover: { moveSpeed: 190, accel: 1800, decel: 2400 },
  attackMoveFactor: 0.3,
  combo: [
    {
      damage: 16,
      range: 56,
      arc: deg(160),
      windupTicks: 7,
      activeTicks: 5,
      recoveryTicks: 14,
      knockback: 280,
      lunge: 120,
      stagger: 16,
    },
    {
      damage: 26,
      range: 62,
      arc: deg(200),
      windupTicks: 12,
      activeTicks: 6,
      recoveryTicks: 22,
      knockback: 440,
      lunge: 180,
      stagger: 32,
    },
  ],
  comboResetTicks: 30,
  dash: {
    maxCharges: 1,
    rechargeTicks: 240,
    durationTicks: 14,
    speed: 560,
    exitMomentum: 0.4,
    refundOnKill: 0,
  },
  critChance: 0.05,
  critMultiplier: 1.5,
  maxEnergy: 100,
  energyOnKill: 8,
  energyPerDamage: 0.12,
  energyPerDamageTaken: 0.6,
  hurtInvulnTicks: 30,
  block: {
    arc: deg(130),
    reduction: 0.8,
    parryWindowTicks: 10,
    parryStunTicks: 75,
    parryEnergy: 12,
    moveFactor: 0.45,
  },
  charge: { damage: 12, knockback: 360, stagger: 36, radius: 20 },
  taunt: { radius: 240, ticks: 180, shield: 30, cooldownTicks: 480 },
  ultimate: { energyCost: 100, radius: 170, damage: 40, knockback: 380, stunTicks: 90, shield: 80 },
  shieldCap: 120,
  passive: { regenDelayTicks: 180, regenPerSecond: 12, regenCap: 30 },
  entry: { radius: 100, damage: 10, knockback: 340, stagger: 30, shield: 25 },
  palette: { body: '#3b4a5e', trim: '#ffcf5a', eyes: '#ffe9a8' },
  labels: {
    primary: 'Masse',
    secondary: 'Bouclier',
    mobility: 'Charge',
    skill: 'Provoc.',
    ultimate: 'Bastion',
  },
};

export const ARCANIST: ArcanistDef = {
  id: 'arcanist',
  name: 'Arcaniste',
  role: 'Mage',
  maxHp: 70,
  radius: 10,
  weight: 1.8,
  mover: { moveSpeed: 225, accel: 2400, decel: 3000 },
  attackMoveFactor: 0.75,
  dash: {
    maxCharges: 1,
    rechargeTicks: 150,
    durationTicks: 0,
    speed: 0,
    exitMomentum: 0,
    refundOnKill: 0,
  },
  critChance: 0.1,
  critMultiplier: 1.6,
  maxEnergy: 100,
  energyOnKill: 12,
  energyPerDamage: 0.18,
  energyPerDamageTaken: 0,
  hurtInvulnTicks: 40,
  maxMana: 100,
  manaRegenPerSecond: 14,
  bolt: {
    damage: 9,
    speed: 560,
    radius: 5,
    lifetimeTicks: 40,
    knockback: 70,
    pierce: 0,
    cooldownTicks: 14,
    stagger: 3,
    empowerEvery: 3,
    empoweredDamageMult: 1.8,
    empoweredPierce: 2,
  },
  frostOrb: {
    manaCost: 25,
    cooldownTicks: 40,
    speed: 360,
    maxRange: 340,
    radius: 66,
    damage: 18,
    slowTicks: 120,
  },
  blink: { distance: 150, invulnTicks: 8, frostRadius: 60, slowTicks: 90 },
  firefield: {
    manaCost: 40,
    cooldownTicks: 420,
    maxRange: 320,
    radius: 72,
    durationTicks: 240,
    burnTicks: 60,
  },
  ultimate: {
    energyCost: 100,
    meteors: 9,
    spread: 140,
    intervalTicks: 7,
    fallTicks: 40,
    radius: 52,
    damage: 30,
    knockback: 260,
  },
  passive: { slowedDamageMult: 1.2 },
  entry: { radius: 130, damage: 8, slowTicks: 120 },
  palette: { body: '#1f3150', trim: '#6fd0ff', eyes: '#bff0ff' },
  labels: {
    primary: 'Traits',
    secondary: 'Givre',
    mobility: 'Blink',
    skill: 'Brasier',
    ultimate: 'Météores',
  },
};

export const CLASSES = {
  shadowBlade: SHADOW_BLADE,
  guardian: GUARDIAN,
  arcanist: ARCANIST,
} as const satisfies Record<string, ClassDef>;
export type ClassId = keyof typeof CLASSES;

export function classDef(id: ClassId): ClassDef {
  return CLASSES[id];
}
