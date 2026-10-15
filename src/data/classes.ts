import type { DashDef, MeleeHitDef, MoverDef, ProjectileDef } from './types';

export interface ClassDef {
  id: string;
  name: string;
  role: string;
  maxHp: number;
  radius: number;
  /** Body weight: resists crowd pushing and divides received knockback. */
  weight: number;
  mover: MoverDef;
  /** Movement multiplier while attacking. */
  attackMoveFactor: number;
  combo: readonly MeleeHitDef[];
  /** Ticks after the last combo hit before the combo resets to its first hit. */
  comboResetTicks: number;
  ranged: ProjectileDef;
  dash: DashDef;
  critChance: number;
  critMultiplier: number;
  /** Damage multiplier when hitting a target from behind. */
  backstabMultiplier: number;
  maxEnergy: number;
  energyOnKill: number;
  /** Energy gained per point of damage dealt (the ultimate fills from kills AND damage). */
  energyPerDamage: number;
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
  /** I-frames after taking a hit. */
  hurtInvulnTicks: number;
  palette: { body: string; trim: string; eyes: string };
}

const deg = (d: number): number => (d * Math.PI) / 180;

export const SHADOW_BLADE: ClassDef = {
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
};

export const CLASSES = { shadowBlade: SHADOW_BLADE } as const satisfies Record<string, ClassDef>;
export type ClassId = keyof typeof CLASSES;
