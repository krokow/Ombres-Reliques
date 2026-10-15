import type { Entity } from '../ecs/world';
import type { RenderKind } from '../ecs/components';
import type { StatusId } from '../data/statuses';
import type { BiomeId } from '../data/biomes';
import type { RoomType } from '../dungeon/floor';

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
      /** Damage over time: no shake, small numbers. */
      dot: boolean;
    }
  | { type: 'kill'; target: Entity; kind: RenderKind; x: number; y: number; byPlayer: boolean }
  | { type: 'dashRefund'; x: number; y: number }
  | { type: 'windup'; entity: Entity }
  | { type: 'projectileWall'; x: number; y: number }
  | { type: 'enemyShoot'; x: number; y: number; angle: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'summon'; x: number; y: number }
  | { type: 'status'; target: Entity; id: StatusId }
  | { type: 'veil'; x: number; y: number; radius: number }
  | { type: 'ambush'; x: number; y: number }
  | { type: 'ambushStrike'; x: number; y: number }
  | { type: 'ultStart'; x: number; y: number }
  | { type: 'ultFail'; x: number; y: number; reason: 'energy' | 'noTarget' }
  | { type: 'blink'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'playerDeath'; x: number; y: number }
  | { type: 'wave'; wave: number; count: number }
  | { type: 'roomEnter'; room: number; roomType: RoomType; firstVisit: boolean }
  | { type: 'doorsLocked'; room: number }
  | { type: 'roomCleared'; room: number; roomType: RoomType }
  | { type: 'stairsOpen'; x: number; y: number }
  | { type: 'secretFound'; x: number; y: number }
  | { type: 'floor'; level: number; biome: BiomeId };
