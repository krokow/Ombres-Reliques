import type { MoverDef } from './types';

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  radius: number;
  mover: MoverDef;
  /** Turn speed (rad/s) while chasing; slow turners can be outflanked for backstabs. */
  turnRate: number;
  /** Starts its attack when the target is this close. */
  attackRange: number;
  /** Stops advancing at this distance (edge to edge) while its attack is on cooldown. */
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
  /** Mass-like factor: knockback received is divided by this. */
  weight: number;
  palette: { body: string; dark: string; eyes: string };
}

export const ENEMIES = {
  ghoul: {
    id: 'ghoul',
    name: 'Goule',
    maxHp: 42,
    radius: 13,
    mover: { moveSpeed: 105, accel: 900, decel: 1200 },
    turnRate: 3.2,
    attackRange: 40,
    holdDistance: 14,
    windupTicks: 30,
    strike: { damage: 12, reach: 22, radius: 20, activeTicks: 6, knockback: 260, lunge: 260 },
    recoveryTicks: 30,
    cooldownTicks: 40,
    weight: 1,
    palette: { body: '#5f7a4c', dark: '#2f3f26', eyes: '#ff4d4d' },
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

export function isEnemyId(id: string): id is EnemyId {
  return Object.hasOwn(ENEMIES, id);
}
