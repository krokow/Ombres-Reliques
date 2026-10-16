import type { Entity } from '../ecs/world';
import type { GameEvent } from './events';

/** What a run achieved: feeds the end screen, the history and meta rewards. */
export interface RunStats {
  ticks: number;
  kills: number;
  elites: number;
  minibosses: number;
  bosses: number;
  damageDealt: number;
  damageTaken: number;
  goldEarned: number;
  deepestFloor: number;
  victory: boolean;
  /** Enemy id → kills this run (bestiary). */
  killsByEnemy: Record<string, number>;
}

export function emptyStats(level = 1): RunStats {
  return {
    ticks: 0,
    kills: 0,
    elites: 0,
    minibosses: 0,
    bosses: 0,
    damageDealt: 0,
    damageTaken: 0,
    goldEarned: 0,
    deepestFloor: level,
    victory: false,
    killsByEnemy: {},
  };
}

/** Folds one simulation event into the stats. */
export function trackEvent(stats: RunStats, ev: GameEvent, player: Entity): void {
  switch (ev.type) {
    case 'kill':
      if (!ev.byPlayer) return;
      stats.kills++;
      if (ev.elite) stats.elites++;
      stats.killsByEnemy[ev.kind] = (stats.killsByEnemy[ev.kind] ?? 0) + 1;
      return;
    // Beating the guardian of the room is what counts (champion packs included).
    case 'roomCleared':
      if (ev.roomType === 'miniboss') stats.minibosses++;
      else if (ev.roomType === 'boss') stats.bosses++;
      return;
    case 'hit':
      if (ev.target === player) stats.damageTaken += ev.damage;
      else if (ev.byPlayer && !ev.ally) stats.damageDealt += ev.damage;
      return;
    case 'pickup':
      stats.goldEarned += ev.amount;
      return;
    case 'floor':
      stats.deepestFloor = Math.max(stats.deepestFloor, ev.level);
      return;
    case 'victory':
      stats.victory = true;
      return;
    default:
      return;
  }
}
