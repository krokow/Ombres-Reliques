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
  /** Procedural sprite family used by the renderer. */
  look: EnemyLook;
}

export type EnemyLook =
  'ghoul' | 'archer' | 'bloater' | 'caster' | 'knight' | 'beast' | 'golem' | 'imp' | 'mortar';

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
  /** Several projectiles in a fan (default 1). */
  volley?: { count: number; spread: number };
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

/** Telegraphs a straight line, then charges along it; stunned if it hits a wall. */
export interface ChargerEnemyDef extends EnemyBase {
  behavior: 'charger';
  /** Starts the windup within this distance (with line of sight). */
  chargeRange: number;
  windupTicks: number;
  aimLockTicks: number;
  charge: {
    speed: number;
    durationTicks: number;
    damage: number;
    knockback: number;
    radius: number;
  };
  wallStunTicks: number;
  recoveryTicks: number;
  cooldownTicks: number;
}

/** Keeps its distance and lobs telegraphed shells at the player's position. */
export interface ArtilleryEnemyDef extends EnemyBase {
  behavior: 'artillery';
  preferredRange: readonly [number, number];
  windupTicks: number;
  shells: number;
  /** Extra shells land around the target within this radius. */
  scatter: number;
  shell: { radius: number; damage: number; knockback: number; delayTicks: number };
  recoveryTicks: number;
  cooldownTicks: number;
}

export interface BossProjectile {
  damage: number;
  speed: number;
  radius: number;
  lifetimeTicks: number;
  knockback: number;
}

/** Boss attacks: every one is telegraphed during its windup. */
export type BossPattern =
  | { kind: 'slam'; windupTicks: number; radius: number; damage: number; knockback: number }
  | {
      kind: 'cone';
      windupTicks: number;
      range: number;
      arc: number;
      damage: number;
      knockback: number;
    }
  | {
      kind: 'volley';
      windupTicks: number;
      count: number;
      spread: number;
      projectile: BossProjectile;
    }
  | { kind: 'nova'; windupTicks: number; count: number; projectile: BossProjectile }
  | { kind: 'summon'; windupTicks: number; id: string; count: number; max: number }
  | {
      kind: 'charge';
      windupTicks: number;
      speed: number;
      durationTicks: number;
      damage: number;
      knockback: number;
    }
  | {
      kind: 'rain';
      windupTicks: number;
      count: number;
      spread: number;
      radius: number;
      damage: number;
      delayTicks: number;
    };

export interface BossPhase {
  /** The phase starts when HP falls to this fraction (first phase: 1). */
  hpBelow: number;
  patterns: readonly BossPattern[];
  /** Pause between two attacks. */
  restTicks: number;
  speedMult: number;
}

export interface BossEnemyDef extends EnemyBase {
  behavior: 'boss';
  title: string;
  phases: readonly BossPhase[];
  /** Stun durations are multiplied by this (bosses resist control). */
  stunResist: number;
  /** Invulnerable roar when entering a new phase. */
  phaseTransitionTicks: number;
}

export type EnemyDef =
  | MeleeEnemyDef
  | RangedEnemyDef
  | KamikazeEnemyDef
  | SummonerEnemyDef
  | ChargerEnemyDef
  | ArtilleryEnemyDef
  | BossEnemyDef;

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
    look: 'ghoul',
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
    look: 'ghoul',
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
    look: 'archer',
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
    look: 'bloater',
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
    look: 'caster',
    xp: 20,
    palette: { body: '#3b2a52', dark: '#1d1429', eyes: '#c77dff' },
  },
  // ------------------------------------------------------------ Crypte (extra)
  tombKnight: {
    id: 'tombKnight',
    name: 'Chevalier des tombes',
    behavior: 'charger',
    look: 'knight',
    maxHp: 70,
    radius: 14,
    mover: { moveSpeed: 85, accel: 700, decel: 1000 },
    turnRate: 2.5,
    sightRange: 520,
    chargeRange: 240,
    windupTicks: 40,
    aimLockTicks: 12,
    charge: { speed: 520, durationTicks: 26, damage: 18, knockback: 360, radius: 18 },
    wallStunTicks: 70,
    recoveryTicks: 40,
    cooldownTicks: 120,
    weight: 2.5,
    xp: 22,
    palette: { body: '#5a5f73', dark: '#2a2d38', eyes: '#7fe0ff' },
  },
  // ------------------------------------------------------------ Forêt corrompue
  thornWolf: {
    id: 'thornWolf',
    name: 'Loup-ronce',
    behavior: 'melee',
    look: 'beast',
    maxHp: 30,
    radius: 11,
    mover: { moveSpeed: 165, accel: 1500, decel: 1600 },
    turnRate: 6,
    sightRange: 560,
    attackRange: 34,
    holdDistance: 18,
    windupTicks: 20,
    strike: { damage: 9, reach: 18, radius: 16, activeTicks: 5, knockback: 180, lunge: 320 },
    recoveryTicks: 22,
    cooldownTicks: 45,
    weight: 0.9,
    xp: 9,
    palette: { body: '#4a5a3a', dark: '#26301c', eyes: '#d6ff5a' },
  },
  sporeling: {
    id: 'sporeling',
    name: 'Sporelin',
    behavior: 'kamikaze',
    look: 'bloater',
    maxHp: 18,
    radius: 12,
    mover: { moveSpeed: 135, accel: 700, decel: 900 },
    turnRate: 5,
    sightRange: 520,
    triggerRange: 36,
    fuseTicks: 36,
    fuseMoveFactor: 0.4,
    explosion: { radius: 70, damage: 14, knockback: 260, poisonTicks: 240 },
    deathFuseTicks: 12,
    weight: 1,
    xp: 7,
    palette: { body: '#b06fb5', dark: '#5a2f60', eyes: '#f5d0ff' },
  },
  thornShooter: {
    id: 'thornShooter',
    name: 'Tireur d’épines',
    behavior: 'ranged',
    look: 'archer',
    maxHp: 26,
    radius: 11,
    mover: { moveSpeed: 100, accel: 900, decel: 1200 },
    turnRate: 5,
    sightRange: 560,
    preferredRange: [160, 280],
    windupTicks: 46,
    aimLockTicks: 14,
    projectile: {
      damage: 6,
      speed: 340,
      radius: 4,
      lifetimeTicks: 90,
      knockback: 70,
      slowTicks: 0,
    },
    volley: { count: 3, spread: 0.32 },
    recoveryTicks: 24,
    cooldownTicks: 80,
    weight: 0.8,
    xp: 12,
    palette: { body: '#7a8f4a', dark: '#3c4a22', eyes: '#ffea5a' },
  },
  rootShaman: {
    id: 'rootShaman',
    name: 'Chaman des racines',
    behavior: 'summoner',
    look: 'caster',
    maxHp: 50,
    radius: 12,
    mover: { moveSpeed: 80, accel: 700, decel: 1000 },
    turnRate: 4,
    sightRange: 560,
    preferredRange: [180, 320],
    channelTicks: 50,
    summonId: 'sapling',
    summonCount: 3,
    maxMinions: 5,
    recoveryTicks: 20,
    cooldownTicks: 220,
    weight: 1,
    xp: 22,
    palette: { body: '#3f5a2e', dark: '#1f2d16', eyes: '#9cff7a' },
  },
  sapling: {
    id: 'sapling',
    name: 'Jeune pousse',
    behavior: 'melee',
    look: 'ghoul',
    maxHp: 12,
    radius: 8,
    mover: { moveSpeed: 140, accel: 1300, decel: 1500 },
    turnRate: 6,
    sightRange: 520,
    attackRange: 26,
    holdDistance: 6,
    windupTicks: 18,
    strike: { damage: 5, reach: 12, radius: 13, activeTicks: 5, knockback: 120, lunge: 200 },
    recoveryTicks: 18,
    cooldownTicks: 35,
    weight: 0.5,
    xp: 3,
    palette: { body: '#6d9a4a', dark: '#36502a', eyes: '#e6ff9a' },
  },
  cursedStag: {
    id: 'cursedStag',
    name: 'Cerf maudit',
    behavior: 'charger',
    look: 'beast',
    maxHp: 60,
    radius: 14,
    mover: { moveSpeed: 120, accel: 900, decel: 1100 },
    turnRate: 3,
    sightRange: 560,
    chargeRange: 280,
    windupTicks: 36,
    aimLockTicks: 10,
    charge: { speed: 600, durationTicks: 24, damage: 16, knockback: 380, radius: 17 },
    wallStunTicks: 60,
    recoveryTicks: 34,
    cooldownTicks: 110,
    weight: 2,
    xp: 20,
    palette: { body: '#d8d2c4', dark: '#6a6252', eyes: '#ff5a8a' },
  },
  // ------------------------------------------------------------ Forge volcanique
  cinderImp: {
    id: 'cinderImp',
    name: 'Diablotin de cendre',
    behavior: 'melee',
    look: 'imp',
    maxHp: 22,
    radius: 9,
    mover: { moveSpeed: 170, accel: 1600, decel: 1700 },
    turnRate: 7,
    sightRange: 560,
    attackRange: 28,
    holdDistance: 10,
    windupTicks: 16,
    strike: { damage: 7, reach: 14, radius: 14, activeTicks: 5, knockback: 140, lunge: 300 },
    recoveryTicks: 18,
    cooldownTicks: 36,
    weight: 0.6,
    xp: 7,
    palette: { body: '#c4502a', dark: '#5a1e10', eyes: '#ffe14d' },
  },
  magmaGolem: {
    id: 'magmaGolem',
    name: 'Golem de magma',
    behavior: 'melee',
    look: 'golem',
    maxHp: 120,
    radius: 17,
    mover: { moveSpeed: 70, accel: 500, decel: 900 },
    turnRate: 1.8,
    sightRange: 520,
    attackRange: 50,
    holdDistance: 16,
    windupTicks: 44,
    strike: { damage: 24, reach: 26, radius: 30, activeTicks: 7, knockback: 420, lunge: 160 },
    recoveryTicks: 40,
    cooldownTicks: 60,
    weight: 4,
    xp: 30,
    palette: { body: '#4a3a34', dark: '#221a17', eyes: '#ff8a3d' },
  },
  emberMortar: {
    id: 'emberMortar',
    name: 'Mortier de braise',
    behavior: 'artillery',
    look: 'mortar',
    maxHp: 40,
    radius: 12,
    mover: { moveSpeed: 70, accel: 600, decel: 900 },
    turnRate: 3,
    sightRange: 600,
    preferredRange: [200, 340],
    windupTicks: 40,
    shells: 3,
    scatter: 50,
    shell: { radius: 42, damage: 14, knockback: 220, delayTicks: 50 },
    recoveryTicks: 30,
    cooldownTicks: 110,
    weight: 1.6,
    xp: 18,
    palette: { body: '#6a4a3a', dark: '#2e1e16', eyes: '#ffb347' },
  },
  slagBomb: {
    id: 'slagBomb',
    name: 'Scorie vive',
    behavior: 'kamikaze',
    look: 'bloater',
    maxHp: 20,
    radius: 13,
    mover: { moveSpeed: 150, accel: 800, decel: 1000 },
    turnRate: 5,
    sightRange: 520,
    triggerRange: 40,
    fuseTicks: 32,
    fuseMoveFactor: 0.45,
    explosion: { radius: 66, damage: 26, knockback: 420, poisonTicks: 0 },
    deathFuseTicks: 10,
    weight: 1.2,
    xp: 8,
    palette: { body: '#3a2a26', dark: '#1a1210', eyes: '#ff6a2a' },
  },
  forgeWarden: {
    id: 'forgeWarden',
    name: 'Contremaître de forge',
    behavior: 'summoner',
    look: 'caster',
    maxHp: 55,
    radius: 13,
    mover: { moveSpeed: 80, accel: 700, decel: 1000 },
    turnRate: 4,
    sightRange: 560,
    preferredRange: [180, 300],
    channelTicks: 48,
    summonId: 'cinderImp',
    summonCount: 2,
    maxMinions: 4,
    recoveryTicks: 20,
    cooldownTicks: 230,
    weight: 1.2,
    xp: 24,
    palette: { body: '#5a2a1e', dark: '#2a120c', eyes: '#ffcf5a' },
  },
  brassBull: {
    id: 'brassBull',
    name: 'Taureau d’airain',
    behavior: 'charger',
    look: 'beast',
    maxHp: 90,
    radius: 16,
    mover: { moveSpeed: 95, accel: 700, decel: 1000 },
    turnRate: 2.6,
    sightRange: 560,
    chargeRange: 300,
    windupTicks: 42,
    aimLockTicks: 10,
    charge: { speed: 640, durationTicks: 26, damage: 22, knockback: 440, radius: 20 },
    wallStunTicks: 80,
    recoveryTicks: 40,
    cooldownTicks: 120,
    weight: 3,
    xp: 28,
    palette: { body: '#b8862e', dark: '#5a3e12', eyes: '#ff4d4d' },
  },
  // ------------------------------------------------------------ Mini-bosses & bosses
  ossuaryWarden: {
    id: 'ossuaryWarden',
    name: 'Gardien d’ossuaire',
    title: 'Gardien d’ossuaire',
    behavior: 'boss',
    look: 'knight',
    maxHp: 380,
    radius: 22,
    mover: { moveSpeed: 90, accel: 700, decel: 1000 },
    turnRate: 3,
    sightRange: 800,
    stunResist: 0.25,
    phaseTransitionTicks: 70,
    phases: [
      {
        hpBelow: 1,
        restTicks: 50,
        speedMult: 1,
        patterns: [
          { kind: 'slam', windupTicks: 42, radius: 80, damage: 20, knockback: 380 },
          {
            kind: 'volley',
            windupTicks: 36,
            count: 5,
            spread: 0.7,
            projectile: { damage: 9, speed: 320, radius: 5, lifetimeTicks: 100, knockback: 80 },
          },
        ],
      },
      {
        hpBelow: 0.5,
        restTicks: 35,
        speedMult: 1.25,
        patterns: [
          {
            kind: 'charge',
            windupTicks: 36,
            speed: 560,
            durationTicks: 26,
            damage: 20,
            knockback: 400,
          },
          { kind: 'slam', windupTicks: 36, radius: 90, damage: 20, knockback: 380 },
          {
            kind: 'volley',
            windupTicks: 30,
            count: 7,
            spread: 1,
            projectile: { damage: 9, speed: 340, radius: 5, lifetimeTicks: 100, knockback: 80 },
          },
        ],
      },
    ],
    weight: 8,
    xp: 120,
    palette: { body: '#8a8e9e', dark: '#3a3d48', eyes: '#7fe0ff' },
  },
  cryptarch: {
    id: 'cryptarch',
    name: 'Le Cryptarque',
    title: 'Le Cryptarque',
    behavior: 'boss',
    look: 'caster',
    maxHp: 750,
    radius: 24,
    mover: { moveSpeed: 80, accel: 600, decel: 900 },
    turnRate: 3,
    sightRange: 900,
    stunResist: 0.2,
    phaseTransitionTicks: 80,
    phases: [
      {
        hpBelow: 1,
        restTicks: 55,
        speedMult: 1,
        patterns: [
          {
            kind: 'volley',
            windupTicks: 40,
            count: 5,
            spread: 0.6,
            projectile: { damage: 10, speed: 300, radius: 6, lifetimeTicks: 110, knockback: 80 },
          },
          { kind: 'summon', windupTicks: 50, id: 'larva', count: 3, max: 6 },
        ],
      },
      {
        hpBelow: 0.66,
        restTicks: 45,
        speedMult: 1.1,
        patterns: [
          {
            kind: 'nova',
            windupTicks: 44,
            count: 14,
            projectile: { damage: 9, speed: 260, radius: 6, lifetimeTicks: 120, knockback: 80 },
          },
          {
            kind: 'rain',
            windupTicks: 30,
            count: 6,
            spread: 120,
            radius: 46,
            damage: 18,
            delayTicks: 50,
          },
          { kind: 'summon', windupTicks: 50, id: 'ghoul', count: 2, max: 4 },
        ],
      },
      {
        hpBelow: 0.33,
        restTicks: 30,
        speedMult: 1.3,
        patterns: [
          {
            kind: 'nova',
            windupTicks: 36,
            count: 18,
            projectile: { damage: 9, speed: 290, radius: 6, lifetimeTicks: 120, knockback: 80 },
          },
          {
            kind: 'rain',
            windupTicks: 24,
            count: 9,
            spread: 140,
            radius: 46,
            damage: 18,
            delayTicks: 45,
          },
          {
            kind: 'volley',
            windupTicks: 30,
            count: 9,
            spread: 1.2,
            projectile: { damage: 10, speed: 330, radius: 6, lifetimeTicks: 110, knockback: 80 },
          },
        ],
      },
    ],
    weight: 10,
    xp: 300,
    palette: { body: '#3b2a52', dark: '#1d1429', eyes: '#c77dff' },
  },
  thornMother: {
    id: 'thornMother',
    name: 'Mère-Ronce',
    title: 'Mère-Ronce',
    behavior: 'boss',
    look: 'golem',
    maxHp: 520,
    radius: 24,
    mover: { moveSpeed: 70, accel: 500, decel: 800 },
    turnRate: 2.5,
    sightRange: 800,
    stunResist: 0.25,
    phaseTransitionTicks: 70,
    phases: [
      {
        hpBelow: 1,
        restTicks: 50,
        speedMult: 1,
        patterns: [
          { kind: 'cone', windupTicks: 40, range: 130, arc: 1.6, damage: 18, knockback: 340 },
          { kind: 'summon', windupTicks: 46, id: 'sapling', count: 4, max: 8 },
        ],
      },
      {
        hpBelow: 0.5,
        restTicks: 36,
        speedMult: 1.2,
        patterns: [
          {
            kind: 'nova',
            windupTicks: 40,
            count: 16,
            projectile: { damage: 8, speed: 270, radius: 5, lifetimeTicks: 110, knockback: 70 },
          },
          { kind: 'cone', windupTicks: 34, range: 150, arc: 2, damage: 18, knockback: 360 },
          { kind: 'summon', windupTicks: 40, id: 'thornWolf', count: 2, max: 4 },
        ],
      },
    ],
    weight: 8,
    xp: 150,
    palette: { body: '#3f5a2e', dark: '#1f2d16', eyes: '#d6ff5a' },
  },
  paleStag: {
    id: 'paleStag',
    name: 'Le Cerf Pâle',
    title: 'Le Cerf Pâle',
    behavior: 'boss',
    look: 'beast',
    maxHp: 1000,
    radius: 24,
    mover: { moveSpeed: 120, accel: 900, decel: 1100 },
    turnRate: 3.5,
    sightRange: 900,
    stunResist: 0.2,
    phaseTransitionTicks: 80,
    phases: [
      {
        hpBelow: 1,
        restTicks: 45,
        speedMult: 1,
        patterns: [
          {
            kind: 'charge',
            windupTicks: 40,
            speed: 620,
            durationTicks: 28,
            damage: 22,
            knockback: 420,
          },
          {
            kind: 'volley',
            windupTicks: 34,
            count: 6,
            spread: 0.9,
            projectile: { damage: 9, speed: 340, radius: 5, lifetimeTicks: 100, knockback: 70 },
          },
        ],
      },
      {
        hpBelow: 0.66,
        restTicks: 38,
        speedMult: 1.15,
        patterns: [
          {
            kind: 'rain',
            windupTicks: 30,
            count: 8,
            spread: 130,
            radius: 44,
            damage: 18,
            delayTicks: 50,
          },
          {
            kind: 'charge',
            windupTicks: 34,
            speed: 660,
            durationTicks: 28,
            damage: 22,
            knockback: 420,
          },
          { kind: 'summon', windupTicks: 40, id: 'thornWolf', count: 2, max: 4 },
        ],
      },
      {
        hpBelow: 0.33,
        restTicks: 26,
        speedMult: 1.35,
        patterns: [
          {
            kind: 'charge',
            windupTicks: 28,
            speed: 700,
            durationTicks: 30,
            damage: 24,
            knockback: 440,
          },
          {
            kind: 'nova',
            windupTicks: 34,
            count: 18,
            projectile: { damage: 9, speed: 300, radius: 5, lifetimeTicks: 110, knockback: 70 },
          },
          {
            kind: 'rain',
            windupTicks: 24,
            count: 10,
            spread: 150,
            radius: 44,
            damage: 18,
            delayTicks: 45,
          },
        ],
      },
    ],
    weight: 10,
    xp: 360,
    palette: { body: '#ece6d6', dark: '#7a7262', eyes: '#ff5a8a' },
  },
  fallenSmith: {
    id: 'fallenSmith',
    name: 'Forgeron déchu',
    title: 'Forgeron déchu',
    behavior: 'boss',
    look: 'golem',
    maxHp: 680,
    radius: 24,
    mover: { moveSpeed: 80, accel: 600, decel: 900 },
    turnRate: 2.5,
    sightRange: 800,
    stunResist: 0.25,
    phaseTransitionTicks: 70,
    phases: [
      {
        hpBelow: 1,
        restTicks: 46,
        speedMult: 1,
        patterns: [
          { kind: 'slam', windupTicks: 44, radius: 95, damage: 24, knockback: 420 },
          {
            kind: 'charge',
            windupTicks: 38,
            speed: 560,
            durationTicks: 26,
            damage: 22,
            knockback: 420,
          },
        ],
      },
      {
        hpBelow: 0.5,
        restTicks: 32,
        speedMult: 1.25,
        patterns: [
          {
            kind: 'rain',
            windupTicks: 28,
            count: 8,
            spread: 130,
            radius: 46,
            damage: 20,
            delayTicks: 48,
          },
          { kind: 'slam', windupTicks: 38, radius: 105, damage: 24, knockback: 420 },
          {
            kind: 'charge',
            windupTicks: 32,
            speed: 600,
            durationTicks: 28,
            damage: 22,
            knockback: 420,
          },
        ],
      },
    ],
    weight: 10,
    xp: 180,
    palette: { body: '#5a4a44', dark: '#2a1e1a', eyes: '#ff8a3d' },
  },
  forgeHeart: {
    id: 'forgeHeart',
    name: 'Cœur de la Forge',
    title: 'Cœur de la Forge',
    behavior: 'boss',
    look: 'golem',
    maxHp: 1300,
    radius: 28,
    mover: { moveSpeed: 60, accel: 500, decel: 800 },
    turnRate: 2.5,
    sightRange: 900,
    stunResist: 0.15,
    phaseTransitionTicks: 90,
    phases: [
      {
        hpBelow: 1,
        restTicks: 50,
        speedMult: 1,
        patterns: [
          {
            kind: 'nova',
            windupTicks: 42,
            count: 16,
            projectile: { damage: 10, speed: 260, radius: 6, lifetimeTicks: 120, knockback: 80 },
          },
          {
            kind: 'rain',
            windupTicks: 30,
            count: 7,
            spread: 130,
            radius: 48,
            damage: 20,
            delayTicks: 50,
          },
          { kind: 'summon', windupTicks: 46, id: 'cinderImp', count: 3, max: 6 },
        ],
      },
      {
        hpBelow: 0.66,
        restTicks: 40,
        speedMult: 1.15,
        patterns: [
          { kind: 'slam', windupTicks: 40, radius: 120, damage: 26, knockback: 440 },
          {
            kind: 'nova',
            windupTicks: 36,
            count: 20,
            projectile: { damage: 10, speed: 280, radius: 6, lifetimeTicks: 120, knockback: 80 },
          },
          { kind: 'summon', windupTicks: 40, id: 'slagBomb', count: 2, max: 3 },
        ],
      },
      {
        hpBelow: 0.33,
        restTicks: 28,
        speedMult: 1.3,
        patterns: [
          {
            kind: 'rain',
            windupTicks: 22,
            count: 12,
            spread: 160,
            radius: 48,
            damage: 20,
            delayTicks: 44,
          },
          {
            kind: 'nova',
            windupTicks: 30,
            count: 24,
            projectile: { damage: 10, speed: 300, radius: 6, lifetimeTicks: 120, knockback: 80 },
          },
          { kind: 'slam', windupTicks: 34, radius: 130, damage: 26, knockback: 440 },
        ],
      },
    ],
    weight: 12,
    xp: 450,
    palette: { body: '#3a2420', dark: '#1a0e0c', eyes: '#ffb347' },
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

export function enemyDef(id: EnemyId): EnemyDef {
  return ENEMIES[id];
}

export function isEnemyId(id: string): id is EnemyId {
  return Object.hasOwn(ENEMIES, id);
}
