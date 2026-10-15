import { describe, expect, it } from 'vitest';
import { Tile } from '../src/core/tilemap';
import { SHADOW_BLADE } from '../src/data/classes';
import { DESCEND_HEAL, DUNGEON } from '../src/data/dungeon';
import { ENEMIES } from '../src/data/enemies';
import type { RoomType } from '../src/dungeon/floor';
import { Game } from '../src/game/game';
import { emptyInput, type InputFrame } from '../src/game/inputFrame';
import { rollEncounter } from '../src/systems/dungeon';
import { spawnEnemy } from '../src/game/factories';
import { Rng } from '../src/core/rng';
import { DT, place, run, runCollect } from './helpers';

function dungeon(seed = 'DUNGEON'): Game {
  return new Game(seed, DT);
}

function goTo(game: Game, type: RoomType): number {
  const room = game.dungeon!.floor.rooms.find((r) => r.type === type)!;
  const c = game.map.tileCenter(room.center.tx, room.center.ty);
  place(game, c.x, c.y);
  return room.id;
}

function killEncounter(game: Game, room: number): void {
  for (const [e, enc] of game.world.query('encounter'))
    if (enc.room === room) game.world.destroy(e);
}

describe('dungeon mode', () => {
  it('starts on floor 1 in the start room, with fog of war', () => {
    const game = dungeon();
    const f = game.dungeon!.floor;
    expect(game.level).toBe(1);
    const t = game.world.req(game.player, 'transform');
    expect(f.roomAt[Math.floor(t.y / 32) * f.map.width + Math.floor(t.x / 32)]).toBe(f.startRoom);
    run(game, 1);
    const explored = f.explored.reduce((a, b) => a + b, 0);
    expect(explored).toBeGreaterThan(0);
    expect(explored).toBeLessThan(f.explored.length / 2);
  });

  it('entering a combat room spawns its encounter, doors stay open (2c)', () => {
    const game = dungeon();
    const room = goTo(game, 'combat');
    const events = runCollect(game, 2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'roomEnter', room, roomType: 'combat' }),
    );
    const spawned = game.world.query('encounter').filter(([, e]) => e.room === room);
    expect(spawned.length).toBeGreaterThanOrEqual(DUNGEON.encounter.baseEnemies);
    const doors = game.dungeon!.floor.rooms[room]!.doors;
    expect(doors.every((d) => game.map.get(d.tx, d.ty) === Tile.DoorOpen)).toBe(true);
    killEncounter(game, room);
    const after = runCollect(game, 2);
    expect(after).toContainEqual(expect.objectContaining({ type: 'roomCleared', room }));
    expect(game.dungeon!.rooms[room]!.cleared).toBe(true);
    // A cleared room never respawns.
    run(game, 5);
    expect(game.world.query('encounter')).toHaveLength(0);
  });

  it('mini-boss rooms lock their doors until the fight is won', () => {
    const game = dungeon();
    const room = goTo(game, 'miniboss');
    const events = runCollect(game, 2);
    expect(events.some((e) => e.type === 'doorsLocked')).toBe(true);
    const doors = game.dungeon!.floor.rooms[room]!.doors;
    expect(doors.every((d) => game.map.get(d.tx, d.ty) === Tile.DoorClosed)).toBe(true);
    expect(game.world.query('champion')).toHaveLength(1);
    killEncounter(game, room);
    run(game, 2);
    expect(doors.every((d) => game.map.get(d.tx, d.ty) === Tile.DoorOpen)).toBe(true);
  });

  it('beating the boss opens the stairs, which lead to the next floor', () => {
    const game = dungeon();
    game.world.req(game.player, 'health').hp = 40;
    const room = goTo(game, 'boss');
    run(game, 2);
    killEncounter(game, room);
    const events = runCollect(game, 2);
    expect(events.some((e) => e.type === 'stairsOpen')).toBe(true);
    const stairs = game.dungeon!.stairs!;
    expect(game.map.get(stairs.tx, stairs.ty)).toBe(Tile.Stairs);
    const firstMap = game.map;
    // Standing on the stairs when they appear does nothing; stepping onto them descends.
    expect(game.level).toBe(1);
    const c = game.map.tileCenter(stairs.tx, stairs.ty);
    place(game, c.x + 40, c.y);
    run(game, 1);
    place(game, c.x, c.y);
    const next = runCollect(game, 1);
    expect(next).toContainEqual(
      expect.objectContaining({ type: 'floor', level: 2, biome: 'forest' }),
    );
    expect(game.level).toBe(2);
    expect(game.map).not.toBe(firstMap);
    expect(game.world.req(game.player, 'health').hp).toBe(40 + SHADOW_BLADE.maxHp * DESCEND_HEAL);
    expect(game.world.query('enemy')).toHaveLength(0);
  });

  it('a player attack breaks the cracked wall of the secret room', () => {
    // Find a seed whose floor has a secret room.
    let game = dungeon('SECRET-0');
    for (let i = 1; game.dungeon!.floor.secretRoom < 0; i++) game = dungeon(`SECRET-${i}`);
    const f = game.dungeon!.floor;
    const crack = f.cracked[0]!;
    const host = f.rooms[f.rooms[f.secretRoom]!.neighbors[0]!]!;
    // Stand next to the crack, on the host room side.
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const [dx, dy] = dirs.find(
      ([x, y]) => f.roomAt[(crack.ty + y) * f.map.width + crack.tx + x] === host.id,
    )!;
    const stand = game.map.tileCenter(crack.tx + dx, crack.ty + dy);
    place(game, stand.x, stand.y);
    for (const [e] of game.world.query('enemy')) game.world.destroy(e);
    const target = game.map.tileCenter(crack.tx, crack.ty);
    const input: Partial<InputFrame> = { attackPressed: true, aimX: target.x, aimY: target.y };
    const events = runCollect(game, 6, input);
    expect(events.some((e) => e.type === 'secretFound')).toBe(true);
    for (const c of f.cracked) expect(game.map.get(c.tx, c.ty)).toBe(Tile.Floor);
  });

  it('encounters scale with the floor', () => {
    const game = new Game('SCALE', DT, { startLevel: 3 });
    const pt = game.world.req(game.player, 'transform');
    const e = spawnEnemy(game, 'ghoul', pt.x + 60, pt.y, { level: 3 });
    expect(game.world.req(e, 'health').max).toBe(
      Math.round(ENEMIES.ghoul.maxHp * (1 + DUNGEON.scaling.hpPerFloor * 2)),
    );
    expect(game.world.req(e, 'enemy').damageMult).toBeCloseTo(
      1 + DUNGEON.scaling.damagePerFloor * 2,
    );
    // Deeper floors bring more enemies into the same room.
    const f = game.dungeon!.floor;
    const r = f.rooms.find((x) => x.type === 'combat')!;
    const n1 = rollEncounter(new Rng(1), { ...f, level: 1 }, r).length;
    const n3 = rollEncounter(new Rng(1), { ...f, level: 3 }, r).length;
    expect(n3).toBeGreaterThan(n1);
  });

  it('the whole dungeon run is deterministic for a seed and inputs', () => {
    const play = (): string => {
      const game = new Game('DET', DT);
      const script = new Rng(5);
      for (let i = 0; i < 900; i++) {
        game.step({
          ...emptyInput(),
          moveX: script.int(-1, 1),
          moveY: script.int(-1, 1),
          aimX: script.range(0, 2000),
          aimY: script.range(0, 1500),
          attackPressed: script.chance(0.1),
          dashPressed: script.chance(0.02),
        });
        game.drainEvents();
      }
      return JSON.stringify(
        game.world.query('transform').map(([e, t]) => [e, t.x.toFixed(3), t.y.toFixed(3)]),
      );
    };
    expect(play()).toBe(play());
  });
});
