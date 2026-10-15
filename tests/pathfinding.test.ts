import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Tile, TileMap } from '../src/core/tilemap';
import { FlowField } from '../src/systems/navigation';
import { findPath, type TilePos } from '../src/systems/pathfinding';

function isValidPath(map: TileMap, start: TilePos, path: TilePos[]): boolean {
  let prev = start;
  for (const p of path) {
    const dx = p.tx - prev.tx;
    const dy = p.ty - prev.ty;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
    if (map.isSolid(p.tx, p.ty)) return false;
    if (
      dx !== 0 &&
      dy !== 0 &&
      (map.isSolid(prev.tx + dx, prev.ty) || map.isSolid(prev.tx, prev.ty + dy))
    )
      return false;
    prev = p;
  }
  return true;
}

describe('findPath (A*)', () => {
  const open = new TileMap(10, 10, 32);

  it('finds the octile-optimal path in open space', () => {
    const path = findPath(open, { tx: 1, ty: 1 }, { tx: 8, ty: 4 });
    expect(path).not.toBeNull();
    expect(path).toHaveLength(7); // 3 diagonals + 4 straight
    expect(path?.at(-1)).toEqual({ tx: 8, ty: 4 });
  });

  it('handles trivial and impossible requests', () => {
    expect(findPath(open, { tx: 2, ty: 2 }, { tx: 2, ty: 2 })).toEqual([]);
    const walled = new TileMap(5, 5, 32);
    walled.set(4, 4, Tile.Wall);
    expect(findPath(walled, { tx: 0, ty: 0 }, { tx: 4, ty: 4 })).toBeNull();
    // Enclosed goal.
    for (const [x, y] of [
      [1, 2],
      [3, 2],
      [2, 1],
      [2, 3],
      [1, 1],
      [3, 3],
      [1, 3],
      [3, 1],
    ] as const) {
      walled.set(x, y, Tile.Wall);
    }
    expect(findPath(walled, { tx: 0, ty: 0 }, { tx: 2, ty: 2 })).toBeNull();
  });

  it('goes around walls without cutting corners', () => {
    const { map } = TileMap.fromLayout(['#######', '#.....#', '#.###.#', '#...#.#', '#######'], 32);
    const start = { tx: 1, ty: 3 };
    const path = findPath(map, start, { tx: 5, ty: 3 });
    expect(path).not.toBeNull();
    expect(isValidPath(map, start, path ?? [])).toBe(true);
  });

  it('agrees with the BFS flow field on reachability over random maps', () => {
    const rng = new Rng(2024);
    for (let n = 0; n < 200; n++) {
      const map = new TileMap(16, 12, 32);
      for (let i = 0; i < map.tiles.length; i++) if (rng.chance(0.3)) map.tiles[i] = Tile.Wall;
      const start = { tx: rng.int(0, 15), ty: rng.int(0, 11) };
      const goal = { tx: rng.int(0, 15), ty: rng.int(0, 11) };
      map.set(start.tx, start.ty, Tile.Floor);
      map.set(goal.tx, goal.ty, Tile.Floor);
      const field = new FlowField(map);
      field.update(goal.tx, goal.ty);
      const path = findPath(map, start, goal);
      const reachable = field.distanceAt(start.tx, start.ty) >= 0;
      expect(path !== null).toBe(reachable);
      if (path) {
        expect(isValidPath(map, start, path)).toBe(true);
        // A* never takes more steps than twice the BFS step count (octile vs uniform cost).
        expect(path.length).toBeLessThanOrEqual(
          Math.max(0, field.distanceAt(start.tx, start.ty)) * 2,
        );
      }
    }
  });
});
