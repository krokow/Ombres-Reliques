import type { World } from './world';

/** Position with the previous tick's value kept for render interpolation. */
export interface Transform {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface PlayerControlled {
  /** Units (pixels) per second. */
  moveSpeed: number;
}

export interface Renderable {
  shape: 'rect';
  width: number;
  height: number;
  color: string;
}

/** All component types, keyed by name. Systems query by these keys. */
export interface Components {
  transform: Transform;
  velocity: Velocity;
  player: PlayerControlled;
  renderable: Renderable;
}

export type GameWorld = World<Components>;

export function transformAt(x: number, y: number): Transform {
  return { x, y, prevX: x, prevY: y };
}
