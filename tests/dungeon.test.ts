import { describe, expect, it } from 'vitest';
import { hashString } from '../src/core/rng';
import { Tile } from '../src/core/tilemap';
import { DUNGEON } from '../src/data/dungeon';
import { floodFill, type Floor } from '../src/dungeon/floor';
import { generateFloor, validateFloor } from '../src/dungeon/generate';

const SEEDS = Array.from({ length: 300 }, (_, i) => `SEED-${i}`);

function fingerprint(f: Floor): number {
  return hashString(`${Array.from(f.map.tiles).join('')}|${f.rooms.map((r) => r.type).join(',')}`);
}

describe('floor generation', () => {
  it('is deterministic per (seed, level) and varies across seeds and levels', () => {
    expect(fingerprint(generateFloor('A', 1))).toBe(fingerprint(generateFloor('A', 1)));
    expect(fingerprint(generateFloor('A', 1))).not.toBe(fingerprint(generateFloor('B', 1)));
    expect(fingerprint(generateFloor('A', 1))).not.toBe(fingerprint(generateFloor('A', 2)));
  });

  it(`always produces a valid, solvable floor (${SEEDS.length} seeds × 3 levels)`, () => {
    for (const seed of SEEDS) {
      for (const level of [1, 2, 3]) {
        const floor = generateFloor(seed, level);
        expect(validateFloor(floor), `${seed} L${level}`).toEqual([]);
      }
    }
  });

  it('places every required room and the special rooms', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const f = generateFloor(seed, 1);
      const count = (t: string): number => f.rooms.filter((r) => r.type === t).length;
      expect(count('start')).toBe(1);
      expect(count('miniboss')).toBe(1);
      expect(count('boss')).toBe(1);
      expect(count('shop')).toBe(DUNGEON.specials.shop);
      expect(count('altar')).toBe(DUNGEON.specials.altar);
      expect(count('treasure')).toBeGreaterThanOrEqual(DUNGEON.specials.treasure[0]);
      expect(count('combat')).toBeGreaterThanOrEqual(2);
      expect(f.rooms[f.bossRoom]?.depth).toBeGreaterThanOrEqual(DUNGEON.minBossDepth);
    }
  });

  it('the boss room is a dead end only reachable through the miniboss room', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const f = generateFloor(seed, 2);
      const boss = f.rooms[f.bossRoom]!;
      expect(boss.neighbors).toEqual([f.minibossRoom]);
      const mini = f.rooms[f.minibossRoom]!;
      const w = f.map.width;
      const withoutMini = floodFill(
        f.map,
        f.spawn,
        (x, y) =>
          !f.map.isSolid(x, y) &&
          f.roomAt[y * w + x] !== mini.id &&
          !mini.doors.some((d) => d.tx === x && d.ty === y),
      );
      expect(withoutMini[boss.center.ty * w + boss.center.tx]).toBe(0);
    }
  });

  it('secret rooms sit behind a breakable wall', () => {
    let withSecret = 0;
    for (const seed of SEEDS.slice(0, 100)) {
      const f = generateFloor(seed, 1);
      if (f.secretRoom < 0) continue;
      withSecret++;
      const secret = f.rooms[f.secretRoom]!;
      const w = f.map.width;
      const normal = floodFill(f.map, f.spawn, (x, y) => !f.map.isSolid(x, y));
      expect(normal[secret.center.ty * w + secret.center.tx]).toBe(0);
      expect(f.cracked).toHaveLength(2);
      for (const c of f.cracked) expect(f.map.get(c.tx, c.ty)).toBe(Tile.Cracked);
    }
    expect(withSecret).toBeGreaterThan(80);
  });

  it('corridors are at least 2 tiles wide everywhere (room for every body)', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const f = generateFloor(seed, 1);
      const open = (x: number, y: number): boolean => !f.map.isSolid(x, y);
      for (let ty = 0; ty < f.map.height; ty++) {
        for (let tx = 0; tx < f.map.width; tx++) {
          if (!open(tx, ty) || f.roomAt[ty * f.map.width + tx] !== -1) continue;
          // Some 2×2 fully open block contains this corridor tile.
          const inBlock = [
            [0, 0],
            [-1, 0],
            [0, -1],
            [-1, -1],
          ].some(
            ([ox, oy]) =>
              open(tx + ox!, ty + oy!) &&
              open(tx + ox! + 1, ty + oy!) &&
              open(tx + ox!, ty + oy! + 1) &&
              open(tx + ox! + 1, ty + oy! + 1),
          );
          expect(inBlock, `${seed} ${tx},${ty}`).toBe(true);
        }
      }
    }
  });

  it('dresses floors differently per biome', () => {
    const walls = (f: Floor): number => f.map.tiles.filter((t) => t === Tile.Wall).length;
    // Crypt pillars vs forest erosion: same seed, different biome → different layouts.
    expect(walls(generateFloor('BIOME', 1))).not.toBe(walls(generateFloor('BIOME', 4)));
    // Choice 1b: three floors per biome.
    expect([1, 2, 3].map((l) => generateFloor('BIOME', l).biome)).toEqual([
      'crypt',
      'crypt',
      'crypt',
    ]);
    expect(generateFloor('BIOME', 4).biome).toBe('forest');
    expect(generateFloor('BIOME', 7).biome).toBe('forge');
    expect(generateFloor('BIOME', 10).biome).toBe('crypt'); // endless loop
  });

  it('is fast enough to generate on the fly', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) generateFloor(`PERF-${i}`, 1);
    expect((performance.now() - t0) / 50).toBeLessThan(30);
  });
});
