import { describe, expect, it } from 'vitest';
import { Tile } from '../src/core/tilemap';
import type { FloorEventKind } from '../src/data/events';
import { FLOOR_EVENTS } from '../src/data/events';
import type { Room } from '../src/dungeon/floor';
import { Game } from '../src/game/game';
import type { GameEvent } from '../src/game/events';
import { emptyInput } from '../src/game/inputFrame';
import { dealDamage } from '../src/systems/damage';
import { interact, nearestInteractable } from '../src/systems/loot';
import { useFountain } from '../src/systems/events';
import { DT } from './helpers';

function setup(kind: FloorEventKind, seed = 'EVT'): { g: Game; room: Room } {
  const g = new Game(seed, DT, { startLevel: 4 });
  g.godMode = true;
  const d = g.dungeon!;
  const room = d.floor.rooms.find((r) => r.type === 'combat' && r.id !== d.floor.startRoom)!;
  // Replace the rolled events with the one under test.
  for (const [e, it] of g.world.query('interactable'))
    if (it.room === room.id && (it.kind === 'fountain' || (it.kind === 'chest' && it.mimic)))
      g.world.destroy(e);
  g.world.flush();
  d.events = [{ kind, room: room.id, phase: 'pending', timer: 0 }];
  return { g, room };
}

function enter(g: Game, room: Room): GameEvent[] {
  const c = g.map.tileCenter(room.center.tx, room.center.ty);
  const t = g.world.req(g.player, 'transform');
  t.x = t.prevX = c.x;
  t.y = t.prevY = c.y;
  const out: GameEvent[] = [];
  for (let i = 0; i < 5; i++) {
    g.step(emptyInput());
    out.push(...g.drainEvents());
  }
  return out;
}

/** Kills the room's current enemies (`waves` passes; jellies split, so several may be needed). */
function killRoom(g: Game, room: Room, waves = 6): GameEvent[] {
  const out: GameEvent[] = [];
  for (let k = 0; k < waves; k++) {
    for (const [e, enc] of g.world.query('encounter')) {
      if (enc.room !== room.id) continue;
      g.world.req(e, 'health').invuln = 0;
      dealDamage(g, e, {
        amount: 99999,
        source: g.player,
        byPlayer: true,
        crit: false,
        backstab: false,
        dirX: 0,
        dirY: 0,
        knockback: 0,
        stagger: 0,
        dot: false,
        originX: 0,
        originY: 0,
      });
    }
    for (let i = 0; i < 40; i++) {
      g.step(emptyInput());
      out.push(...g.drainEvents());
    }
    if (!g.world.query('encounter').some(([, enc]) => enc.room === room.id)) break;
  }
  return out;
}

const encounterCount = (g: Game, room: Room): number =>
  g.world.query('encounter').filter(([, enc]) => enc.room === room.id).length;

describe('Événements d’étage', () => {
  it('each floor rolls 1-2 events in combat rooms, deterministically', () => {
    for (const seed of ['A', 'B', 'C', 'D']) {
      const a = new Game(seed, DT, { startLevel: 5 }).dungeon!.events;
      const b = new Game(seed, DT, { startLevel: 5 }).dungeon!.events;
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(a.length).toBeLessThanOrEqual(2);
      expect(new Set(a.map((e) => e.room)).size).toBe(a.length);
    }
  });

  it('ambush: a second wave seals the room, then a reward', () => {
    const { g, room } = setup('ambush');
    enter(g, room);
    // Kill until the ambush triggers (stop there).
    let events: GameEvent[] = [];
    for (let k = 0; k < 6 && !events.some((e) => e.type === 'floorEvent'); k++)
      events.push(...killRoom(g, room, 1));
    expect(events.some((e) => e.type === 'floorEvent' && e.kind === 'ambush')).toBe(true);
    expect(encounterCount(g, room)).toBeGreaterThan(0);
    expect(room.doors.some((dr) => g.map.get(dr.tx, dr.ty) === Tile.DoorClosed)).toBe(true);
    events = killRoom(g, room);
    expect(events.some((e) => e.type === 'roomCleared' && e.room === room.id)).toBe(true);
    expect(room.doors.every((dr) => g.map.get(dr.tx, dr.ty) !== Tile.DoorClosed)).toBe(true);
    expect(g.dungeon!.events[0]!.phase).toBe('done');
  });

  it('mimic: opening the chest wakes a champion; killing it drops an epic item', () => {
    const { g, room } = setup('mimic');
    enter(g, room);
    killRoom(g, room);
    // Place a mimic chest next to the player and open it.
    const t = g.world.req(g.player, 'transform');
    const e = g.world.create();
    g.world.add(e, 'transform', { x: t.x + 10, y: t.y, prevX: t.x + 10, prevY: t.y });
    g.world.add(e, 'interactable', {
      kind: 'chest',
      locked: false,
      opened: false,
      room: room.id,
      mimic: true,
    });
    expect(nearestInteractable(g)).toBe(e);
    interact(g);
    g.world.flush();
    const mimic = g.world.query('enemy').find(([, ai]) => ai.defId === 'mimic');
    expect(mimic).toBeDefined();
    killRoom(g, room);
    const items = g.world
      .query('pickup')
      .filter(
        ([, p]) => p.kind === 'item' && (p.item.rarity === 'epic' || p.item.rarity === 'legendary'),
      );
    expect(items.length).toBeGreaterThan(0);
  });

  it('rift: clearing in time opens a chest; too slow and it closes', () => {
    const fast = setup('rift');
    enter(fast.g, fast.room);
    expect(fast.g.dungeon!.events[0]!.phase).toBe('active');
    const before = fast.g.world.query('interactable').length;
    killRoom(fast.g, fast.room);
    expect(fast.g.world.query('interactable').length).toBe(before + 1);

    const slow = setup('rift');
    enter(slow.g, slow.room);
    slow.g.dungeon!.events[0]!.timer = 2;
    for (let i = 0; i < 5; i++) slow.g.step(emptyInput());
    expect(slow.g.dungeon!.events[0]!.phase).toBe('done');
    const n = slow.g.world.query('interactable').length;
    killRoom(slow.g, slow.room);
    expect(slow.g.world.query('interactable').length).toBe(n);
  });

  it('merchant: a discounted shop sets up once the room is cleared', () => {
    const { g, room } = setup('merchant');
    enter(g, room);
    killRoom(g, room);
    const shops = g.world
      .query('interactable')
      .filter(([, it]) => it.kind === 'shop' && it.room === room.id);
    expect(shops).toHaveLength(FLOOR_EVENTS.merchant.offers);
  });

  it('fountain: single use, every outcome does something', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30 && seen.size < 4; i++) {
      const { g, room } = setup('fountain', `F${i}`);
      const e = g.world.create();
      g.world.add(e, 'transform', { x: 0, y: 0, prevX: 0, prevY: 0 });
      g.world.add(e, 'interactable', { kind: 'fountain', used: false, room: room.id });
      g.world.req(g.player, 'health').hp = 10;
      useFountain(g, e);
      const text = g.drainEvents().find((ev) => ev.type === 'floorEvent');
      if (text?.type === 'floorEvent') seen.add(text.text);
      useFountain(g, e);
      expect(g.drainEvents().some((ev) => ev.type === 'floorEvent')).toBe(false);
    }
    expect(seen.size).toBe(4);
  });
});
