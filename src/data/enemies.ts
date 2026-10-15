import type { MoverDef } from './types';

interface EnemyBase {
  id: string;
  name: string;
  maxHp: number;
  radius: number;
  mover: MoverDef;
  /** Turn speed (rad/s) while chasing; slow turners can be outflanked for backstabs. */
  turnRate: number;
  /** Notices the player within this distance (with line of sight). */
  sightRange: number;
  /** Mass-like factor: knockback and crowd pushing received are divided by this. */
  weight: number;
  palette: { body: string; dark: string; eyes: string };
  /** Experience granted when killed (before elite/champion multipliers). */
  xp: number;
}

export interface MeleeEnemyDef extends EnemyBase {
  behavior: 'melee';
  /** Starts its attack when the target is this close (centre to edge). */
  attackRange: number;
  /** Stops advancing at this gap (edge to edge) while its attack is on cooldown. */
  holdDistance: number;
  windupTicks: number;
  strike: {
    damage: number;
    /** Hit circle centre distance in front of the enemy. */
    reach: number;
    radius: number;
    activeTicks: number;
    knockback: number;
    lunge: number;
  };
  recoveryTicks: number;
  cooldownTicks: number;
}

export interface RangedEnemyDef extends EnemyBase {
  behavior: 'ranged';
  /** Tries to stay within [min, max] of its target. */
  preferredRange: readonly [number, number];
  windupTicks: number;
  /** Aim stops tracking this many ticks before firing: the dodge window. */
  aimLockTicks: number;
  projectile: {
    damage: number;
    speed: number;
    radius: number;
    lifetimeTicks: number;
    knockback: number;
    slowTicks: number;
  };
  recoveryTicks: number;
  cooldownTicks: number;
}

export interface KamikazeEnemyDef extends EnemyBase {
  behavior: 'kamikaze';
  /** Lights its fuse when this close to the target (centre to edge). */
  triggerRange: number;
  fuseTicks: number;
  /** Speed multiplier while the fuse burns. */
  fuseMoveFactor: number;
  explosion: { radius: number; damage: number; knockback: number; poisonTicks: number };
  /** Delay before exploding when killed (chain reactions!). */
  deathFuseTicks: number;
}

export interface SummonerEnemyDef extends EnemyBase {
  behavior: 'summoner';
  preferredRange: readonly [number, number];
  channelTicks: number;
  /** Enemy id (checked by tests; typed as string to avoid a circular type). */
  summonId: string;
  summonCount: number;
  maxMinions: number;
  recoveryTicks: number;
  cooldownTicks: number;
}

export type EnemyDef = MeleeEnemyDef | RangedEnemyDef | KamikazeEnemyDef | SummonerEnemyDef;

export const ENEMIES = {
  ghoul: {
    id: 'ghoul',
    name: 'Goule',
    behavior: 'melee',
    maxHp: 42,
    radius: 13,
    mover: { moveSpeed: 105, accel: 900, decel: 1200 },
    turnRate: 3.2,
    sightRange: 520,
    attackRange: 40,
    holdDistance: 14,
    windupTicks: 30,
    strike: { damage: 12, reach: 22, radius: 20, activeTicks: 6, knockback: 260, lunge: 260 },
    recoveryTicks: 30,
    cooldownTicks: 40,
    weight: 1,
    xp: 10,
    palette: { body: '#5f7a4c', dark: '#2f3f26', eyes: '#ff4d4d' },
  },
  larva: {
    id: 'larva',
    name: 'Larve',
    behavior: 'melee',
    maxHp: 14,
    radius: 8,
    mover: { moveSpeed: 150, accel: 1400, decel: 1600 },
    turnRate: 6,
    sightRange: 520,
    attackRange: 26,
    holdDistance: 6,
    windupTicks: 18,
    strike: { damage: 5, reach: 12, radius: 13, activeTicks: 5, knockback: 120, lunge: 220 },
    recoveryTicks: 18,
    cooldownTicks: 35,
    weight: 0.5,
    xp: 3,
    palette: { body: '#b8a77a', dark: '#5c5136', eyes: '#ff9a4d' },
  },
  boneArcher: {
    id: 'boneArcher',
    name: "Archer d'ossuaire",
    behavior: 'ranged',
    maxHp: 28,
    radius: 11,
    mover: { moveSpeed: 95, accel: 900, decel: 1200 },
    turnRate: 5,
    sightRange: 560,
    preferredRange: [150, 280],
    windupTicks: 42,
    aimLockTicks: 12,
    projectile: {
      damage: 9,
      speed: 380,
      radius: 4,
      lifetimeTicks: 90,
      knockback: 90,
      slowTicks: 60,
    },
    recoveryTicks: 20,
    cooldownTicks: 70,
    weight: 0.8,
    xp: 12,
    palette: { body: '#d9d2bf', dark: '#5e574a', eyes: '#6fd0ff' },
  },
  bloater: {
    id: 'bloater',
    name: 'Boursouflé',
    behavior: 'kamikaze',
    maxHp: 22,
    radius: 14,
    mover: { moveSpeed: 125, accel: 600, decel: 900 },
    turnRate: 4,
    sightRange: 520,
    triggerRange: 40,
    fuseTicks: 42,
    fuseMoveFactor: 0.35,
    explosion: { radius: 62, damage: 22, knockback: 380, poisonTicks: 150 },
    deathFuseTicks: 14,
    weight: 1.4,
    xp: 8,
    palette: { body: '#8a9a3a', dark: '#4a5320', eyes: '#ffe14d' },
  },
  cryptomancer: {
    id: 'cryptomancer',
    name: 'Cryptomancien',
    behavior: 'summoner',
    maxHp: 45,
    radius: 12,
    mover: { moveSpeed: 80, accel: 700, decel: 1000 },
    turnRate: 4,
    sightRange: 560,
    preferredRange: [180, 320],
    channelTicks: 55,
    summonId: 'larva',
    summonCount: 2,
    maxMinions: 4,
    recoveryTicks: 20,
    cooldownTicks: 240,
    weight: 1,
    xp: 20,
    palette: { body: '#3b2a52', dark: '#1d1429', eyes: '#c77dff' },
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

export function enemyDef(id: EnemyId): EnemyDef {
  return ENEMIES[id];
}

export function isEnemyId(id: string): id is EnemyId {
  return Object.hasOwn(ENEMIES, id);
}
