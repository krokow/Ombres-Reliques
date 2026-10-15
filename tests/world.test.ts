import { describe, expect, it } from 'vitest';
import { World } from '../src/ecs/world';

interface C {
  pos: { x: number };
  vel: { v: number };
  tag: true;
}

describe('World', () => {
  it('creates entities and stores components', () => {
    const w = new World<C>();
    const e = w.create();
    w.add(e, 'pos', { x: 1 });
    expect(w.get(e, 'pos')).toEqual({ x: 1 });
    expect(w.has(e, 'vel')).toBe(false);
    expect(() => w.req(e, 'vel')).toThrow();
  });

  it('queries entities having all requested components', () => {
    const w = new World<C>();
    const a = w.create();
    const b = w.create();
    w.add(a, 'pos', { x: 1 });
    w.add(a, 'vel', { v: 2 });
    w.add(b, 'pos', { x: 3 });
    const rows = w.query('pos', 'vel');
    expect(rows).toEqual([[a, { x: 1 }, { v: 2 }]]);
    expect(w.query('pos')).toHaveLength(2);
  });

  it('defers destruction until flush', () => {
    const w = new World<C>();
    const e = w.create();
    w.add(e, 'tag', true);
    w.destroy(e);
    expect(w.isAlive(e)).toBe(true);
    expect(w.query('tag')).toHaveLength(0); // already hidden from queries
    w.flush();
    expect(w.isAlive(e)).toBe(false);
    expect(w.get(e, 'tag')).toBeUndefined();
    expect(w.entityCount).toBe(0);
  });

  it('is safe to add components while iterating a query', () => {
    const w = new World<C>();
    for (let i = 0; i < 3; i++) w.add(w.create(), 'pos', { x: i });
    for (const [e] of w.query('pos')) w.add(w.create(), 'pos', { x: e });
    expect(w.query('pos')).toHaveLength(6);
  });

  it('refuses components on dead entities', () => {
    const w = new World<C>();
    const e = w.create();
    w.destroy(e);
    w.flush();
    expect(() => w.add(e, 'tag', true)).toThrow();
  });
});
