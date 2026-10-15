import type { TileMap } from '../core/tilemap';
import type { BiomeId } from '../data/biomes';

export type RoomType =
  'start' | 'combat' | 'treasure' | 'shop' | 'altar' | 'secret' | 'miniboss' | 'boss';

export interface TilePos {
  tx: number;
  ty: number;
}

export interface Room {
  id: number;
  type: RoomType;
  /** Original rectangle (tiles) before dressing; dressing may grow the room organically. */
  x: number;
  y: number;
  w: number;
  h: number;
  center: TilePos;
  /** Rooms reachable through a corridor (the secret room links through a cracked wall). */
  neighbors: number[];
  /** Graph distance from the start room (-1 for the secret room). */
  depth: number;
  /** Door tiles (corridor tiles touching this room). */
  doors: TilePos[];
}

/** A generated floor. Pure data: the simulation turns it into encounters. */
export interface Floor {
  level: number;
  biome: BiomeId;
  map: TileMap;
  rooms: Room[];
  /** Room id per tile, -1 for corridors and walls. */
  roomAt: Int16Array;
  startRoom: number;
  minibossRoom: number;
  bossRoom: number;
  secretRoom: number;
  cracked: TilePos[];
  spawn: TilePos;
  /** Fog of war: 1 = seen. */
  explored: Uint8Array;
  /** Generation attempt that succeeded (debug). */
  attempt: number;
}

export function roomIdAt(floor: Floor, tx: number, ty: number): number {
  if (!floor.map.inBounds(tx, ty)) return -1;
  return floor.roomAt[ty * floor.map.width + tx] ?? -1;
}

/** 4-connected flood fill from `start` over tiles accepted by `passable`. */
export function floodFill(
  map: TileMap,
  start: TilePos,
  passable: (tx: number, ty: number) => boolean,
): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
  if (!passable(start.tx, start.ty)) return seen;
  const stack = [start.ty * map.width + start.tx];
  seen[start.ty * map.width + start.tx] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!map.inBounds(nx, ny)) continue;
      const n = ny * map.width + nx;
      if (seen[n] || !passable(nx, ny)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return seen;
}
