import { describe, expect, it } from 'vitest';
import { FixedStepClock, FpsCounter } from '../src/core/loop';

describe('FixedStepClock', () => {
  it('runs one step per 1/60 s regardless of frame rate', () => {
    const at144 = new FixedStepClock(60);
    const at30 = new FixedStepClock(60);
    let steps144 = 0;
    let steps30 = 0;
    for (let i = 0; i < 144; i++) steps144 += at144.advance(1000 / 144).steps;
    for (let i = 0; i < 30; i++) steps30 += at30.advance(1000 / 30).steps;
    expect(steps144).toBeGreaterThanOrEqual(59);
    expect(steps144).toBeLessThanOrEqual(60);
    expect(steps30).toBe(60);
  });

  it('exposes the leftover as interpolation alpha', () => {
    const clock = new FixedStepClock(60);
    const { steps, alpha } = clock.advance(1000 / 60 / 2);
    expect(steps).toBe(0);
    expect(alpha).toBeCloseTo(0.5);
  });

  it('caps steps after a long stall', () => {
    const clock = new FixedStepClock(60, 5);
    expect(clock.advance(5000).steps).toBe(5);
    expect(clock.advance(0).steps).toBe(0);
  });

  it('ignores negative deltas', () => {
    expect(new FixedStepClock(60).advance(-100).steps).toBe(0);
  });
});

describe('FpsCounter', () => {
  it('averages over the window', () => {
    const c = new FpsCounter(500);
    for (let i = 0; i < 30; i++) c.frame(1000 / 60);
    expect(c.fps).toBeCloseTo(60, 0);
  });
});
