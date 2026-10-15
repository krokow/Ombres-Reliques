import { describe, expect, it } from 'vitest';
import { hashString, normalizeSeed, Rng, seedFromNumber } from '../src/core/rng';

const draw = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('same seed → same sequence', () => {
    expect(draw(Rng.fromString('OMBRE'), 100)).toEqual(draw(Rng.fromString('OMBRE'), 100));
  });

  it('different seeds → different sequences', () => {
    expect(draw(Rng.fromString('A'), 10)).not.toEqual(draw(Rng.fromString('B'), 10));
  });

  it('normalises typed seeds', () => {
    expect(normalizeSeed('  abc ')).toBe('ABC');
    expect(draw(Rng.fromString('abc'), 5)).toEqual(draw(Rng.fromString(' ABC'), 5));
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const rng = new Rng(42);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let k = 0; k < n; k++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const i = Math.floor(v * 10);
      buckets[i] = (buckets[i] ?? 0) + 1;
    }
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n * 0.01);
  });

  it('int() is inclusive on both bounds', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('fork() is deterministic and independent from parent consumption', () => {
    const a = Rng.fromString('SEED');
    const b = Rng.fromString('SEED');
    draw(b, 50); // consuming the parent must not change the fork
    expect(draw(a.fork('loot'), 10)).toEqual(draw(b.fork('loot'), 10));
    expect(draw(a.fork('loot'), 10)).not.toEqual(draw(a.fork('dungeon'), 10));
  });

  it('state can be saved and restored', () => {
    const rng = new Rng(123);
    draw(rng, 10);
    const state = rng.getState();
    const expected = draw(rng, 5);
    rng.setState(state);
    expect(draw(rng, 5)).toEqual(expected);
  });

  it('weighted() respects weights', () => {
    const rng = new Rng(9);
    let rare = 0;
    for (let i = 0; i < 10_000; i++) {
      if (
        rng.weighted([
          { weight: 9, value: 'common' },
          { weight: 1, value: 'rare' },
        ]) === 'rare'
      )
        rare++;
    }
    expect(rare).toBeGreaterThan(800);
    expect(rare).toBeLessThan(1200);
  });

  it('shuffle() is a permutation', () => {
    const out = new Rng(1).shuffle([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('hashString / seedFromNumber are stable', () => {
    expect(hashString('OMBRE')).toBe(hashString('OMBRE'));
    expect(seedFromNumber(0)).toBe('0000000');
  });
});
