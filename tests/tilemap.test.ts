import { describe, expect, it } from 'vitest';
import { moveAndCollide, TileMap } from '../src/core/tilemap';

const { map } = TileMap.fromLayout(['#####', '#...#', '#...#', '#...#', '#####'], 32);

describe('TileMap', () => {
  it('parses layouts and markers', () => {
    const parsed = TileMap.fromLayout(['###', '#P#', '###'], 16);
    expect(parsed.markers.get('P')).toEqual([{ tx: 1, ty: 1 }]);
    expect(parsed.map.isSolid(1, 1)).toBe(false);
    expect(parsed.map.isSolid(0, 0)).toBe(true);
  });

  it('treats out-of-bounds as solid', () => {
    expect(map.isSolid(-1, 2)).toBe(true);
    expect(map.isSolid(99, 2)).toBe(true);
  });
});

describe('moveAndCollide', () => {
  it('moves freely in open space', () => {
    const r = moveAndCollide(map, 80, 80, 10, 5, -3);
    expect(r).toMatchObject({ x: 85, y: 77, hitX: false, hitY: false });
  });

  it('stops flush against a wall and slides along it', () => {
    // Inner floor spans x in [32, 128); wall starts at x = 128.
    const r = moveAndCollide(map, 100, 80, 10, 50, 7);
    expect(r.hitX).toBe(true);
    expect(r.hitY).toBe(false);
    expect(r.x + 10).toBeLessThanOrEqual(128);
    expect(r.x + 10).toBeGreaterThan(127.9);
    expect(r.y).toBeCloseTo(87);
  });

  it('never tunnels through walls at high speed', () => {
    const r = moveAndCollide(map, 80, 80, 10, -5000, 0);
    expect(r.x - 10).toBeGreaterThanOrEqual(32);
  });
});

describe('lineOfSight', () => {
  const { map: pillar } = TileMap.fromLayout(
    ['#######', '#.....#', '#..#..#', '#.....#', '#######'],
    32,
  );

  it('is clear in open space and blocked by a pillar', () => {
    expect(pillar.lineOfSight(48, 48, 176, 48)).toBe(true);
    expect(pillar.lineOfSight(48, 80, 176, 80)).toBe(false);
    expect(pillar.lineOfSight(112, 48, 112, 112)).toBe(false);
  });

  it('ignores the start and end tiles themselves', () => {
    expect(pillar.lineOfSight(48, 48, 48, 48)).toBe(true);
    expect(pillar.lineOfSight(80, 80, 112, 80)).toBe(true); // endpoint inside the wall tile
  });

  it('handles diagonals', () => {
    expect(pillar.lineOfSight(48, 48, 176, 112)).toBe(false);
    expect(pillar.lineOfSight(48, 112, 80, 48)).toBe(true);
  });
});
