import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { isBehind, rollDamage, shapeHitsCircle } from '../src/systems/combatMath';

const HALF = (70 * Math.PI) / 180;
const stats = { critChance: 0.25, critMultiplier: 2, backstabMultiplier: 1.5 };

describe('isBehind', () => {
  it('detects the rear cone', () => {
    // Target at origin facing +x; attacker on -x is behind.
    expect(isBehind(0, 0, 0, -10, 0, HALF)).toBe(true);
    expect(isBehind(0, 0, 0, 10, 0, HALF)).toBe(false);
    expect(isBehind(0, 0, 0, 0, 10, HALF)).toBe(false); // flank is not behind
    expect(isBehind(0, 0, Math.PI, 10, 0, HALF)).toBe(true); // wraps around ±PI
  });
});

describe('rollDamage', () => {
  it('backstab is a guaranteed crit with its own multiplier', () => {
    expect(rollDamage(10, stats, true, new Rng(1))).toEqual({ amount: 15, crit: true });
  });

  it('entities without stats deal flat damage', () => {
    expect(rollDamage(12, null, false, new Rng(1))).toEqual({ amount: 12, crit: false });
  });

  it('crits at roughly the configured rate', () => {
    const rng = new Rng(5);
    let crits = 0;
    for (let i = 0; i < 10_000; i++) if (rollDamage(10, stats, false, rng).crit) crits++;
    expect(crits / 10_000).toBeCloseTo(0.25, 1);
  });
});

describe('shapeHitsCircle', () => {
  const arc = { kind: 'arc' as const, range: 40, arc: Math.PI / 2 };

  it('arc hits targets in front and within range', () => {
    expect(shapeHitsCircle(arc, 0, 0, 0, 30, 0, 5)).toBe(true);
    expect(shapeHitsCircle(arc, 0, 0, 0, 50, 0, 5)).toBe(false);
    expect(shapeHitsCircle(arc, 0, 0, 0, -30, 0, 5)).toBe(false);
  });

  it('arc counts grazes on its edge thanks to target radius', () => {
    // 50° off-axis is outside a 90° arc for a point, inside for a fat target.
    const x = Math.cos((50 * Math.PI) / 180) * 30;
    const y = Math.sin((50 * Math.PI) / 180) * 30;
    expect(shapeHitsCircle(arc, 0, 0, 0, x, y, 0.1)).toBe(false);
    expect(shapeHitsCircle(arc, 0, 0, 0, x, y, 8)).toBe(true);
  });

  it('offset circle is placed along the angle', () => {
    const circle = { kind: 'circle' as const, radius: 10, offset: 20 };
    expect(shapeHitsCircle(circle, 0, 0, Math.PI / 2, 0, 20, 1)).toBe(true);
    expect(shapeHitsCircle(circle, 0, 0, Math.PI / 2, 20, 0, 1)).toBe(false);
  });
});
