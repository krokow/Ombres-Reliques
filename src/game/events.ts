import type { Entity } from '../ecs/world';
import type { RenderKind } from '../ecs/components';

/**
 * One-way notifications from the simulation to presentation (VFX, audio, HUD).
 * Presentation may react however it likes; it never feeds back into the sim.
 */
export type GameEvent =
  | {
      type: 'swing';
      owner: Entity;
      x: number;
      y: number;
      angle: number;
      arc: number;
      range: number;
      combo: number;
    }
  | { type: 'throw'; x: number; y: number; angle: number }
  | { type: 'dash'; x: number; y: number; dirX: number; dirY: number }
  | {
      type: 'hit';
      target: Entity;
      x: number;
      y: number;
      damage: number;
      crit: boolean;
      backstab: boolean;
      dirX: number;
      dirY: number;
      byPlayer: boolean;
    }
  | { type: 'kill'; target: Entity; kind: RenderKind; x: number; y: number; byPlayer: boolean }
  | { type: 'dashRefund'; x: number; y: number }
  | { type: 'windup'; entity: Entity }
  | { type: 'projectileWall'; x: number; y: number }
  | { type: 'playerDeath'; x: number; y: number }
  | { type: 'wave'; wave: number; count: number };
