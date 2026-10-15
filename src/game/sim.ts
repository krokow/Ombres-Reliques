import type { Rng } from '../core/rng';
import type { TileMap } from '../core/tilemap';
import type { GameWorld } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { FlowField } from '../systems/navigation';
import type { GameEvent } from './events';

/** What systems get to see of the game. Keeps systems decoupled from the Game class. */
export interface Sim {
  readonly world: GameWorld;
  readonly map: TileMap;
  readonly dt: number;
  readonly player: Entity;
  readonly playerAlive: boolean;
  /** Independent RNG streams (see Rng.fork). */
  readonly rng: { readonly combat: Rng; readonly spawn: Rng; readonly ai: Rng };
  readonly events: GameEvent[];
  /** Path field towards the player, refreshed each tick. */
  readonly nav: FlowField;
  /** Freezes the simulation for `ticks` (keeps the longest request). */
  hitstop(ticks: number): void;
  godMode: boolean;
}
