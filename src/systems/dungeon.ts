import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { Tile } from '../core/tilemap';
import { DUNGEON, type EncounterEntry } from '../data/dungeon';
import type { EliteModifierId } from '../data/elites';
import { ELITE_MODIFIERS } from '../data/elites';
import type { EnemyId } from '../data/enemies';
import { floodFill, roomIdAt, type Floor, type Room } from '../dungeon/floor';
import type { Entity } from '../ecs/world';
import { spawnEnemy } from '../game/factories';
import type { Sim } from '../game/sim';
import { shapeHitsCircle } from './combatMath';

export interface RoomState {
  visited: boolean;
  active: boolean;
  cleared: boolean;
}

/** Run-time state of the current floor (the generated Floor itself stays pure data). */
export interface DungeonState {
  floor: Floor;
  rooms: RoomState[];
  currentRoom: number;
  lastTile: number;
  /** Bumped when exploration changes (minimap cache). */
  exploredVersion: number;
  stairs: { tx: number; ty: number } | null;
  descendRequested: boolean;
  altarsUsed: Set<number>;
}

export function createDungeonState(floor: Floor): DungeonState {
  return {
    floor,
    rooms: floor.rooms.map((r) => ({
      visited: false,
      active: false,
      // Rooms without a fight start "cleared".
      cleared: r.type !== 'combat' && r.type !== 'miniboss' && r.type !== 'boss',
    })),
    currentRoom: -1,
    lastTile: -1,
    exploredVersion: 0,
    stairs: null,
    descendRequested: false,
    altarsUsed: new Set(),
  };
}

export interface EncounterSpawn {
  id: EnemyId;
  elite: EliteModifierId[];
  champion?: string;
}

/** Number of floor tiles of a room (after dressing). */
export function roomArea(floor: Floor, room: number): number {
  let n = 0;
  for (let i = 0; i < floor.roomAt.length; i++) {
    if (
      floor.roomAt[i] === room &&
      !floor.map.isSolid(i % floor.map.width, Math.floor(i / floor.map.width))
    )
      n++;
  }
  return n;
}

function expand(entries: readonly EncounterEntry[]): EncounterSpawn[] {
  return entries.flatMap((e) =>
    Array.from({ length: e.count ?? 1 }, () => ({
      id: e.id,
      elite: [...(e.elite ?? [])],
      ...(e.champion ? { champion: e.champion } : {}),
    })),
  );
}

/** What spawns in a room (seeded). */
export function rollEncounter(rng: Rng, floor: Floor, room: Room): EncounterSpawn[] {
  const enc = DUNGEON.encounter;
  if (room.type === 'miniboss') return expand(enc.miniboss);
  if (room.type === 'boss') return expand(enc.boss);
  if (room.type !== 'combat') return [];
  const count = Math.min(
    enc.max,
    enc.baseEnemies +
      Math.floor(roomArea(floor, room.id) / enc.tilesPerEnemy) +
      enc.perFloor * (floor.level - 1),
  );
  const pool = enc.pool
    .filter((p) => p.minFloor <= floor.level)
    .map((p) => ({ weight: p.weight, value: p.id }));
  const eliteChance = clamp(
    enc.eliteChance.base + enc.eliteChance.perFloor * (floor.level - 1),
    0,
    enc.eliteChance.max,
  );
  const mods = Object.keys(ELITE_MODIFIERS) as EliteModifierId[];
  return Array.from({ length: count }, () => ({
    id: rng.weighted(pool),
    elite: rng.chance(eliteChance) ? [rng.pick(mods)] : [],
  }));
}

/** Marks tiles in sight around the player as explored. */
function reveal(sim: Sim, d: DungeonState, px: number, py: number): void {
  const { map, explored } = d.floor;
  const s = map.tileSize;
  const ptx = Math.floor(px / s);
  const pty = Math.floor(py / s);
  const r = DUNGEON.revealRadius;
  for (let ty = pty - r; ty <= pty + r; ty++) {
    for (let tx = ptx - r; tx <= ptx + r; tx++) {
      if (!map.inBounds(tx, ty) || (tx - ptx) ** 2 + (ty - pty) ** 2 > r * r) continue;
      const i = ty * map.width + tx;
      if (explored[i]) continue;
      if (sim.map.lineOfSight(px, py, (tx + 0.5) * s, (ty + 0.5) * s)) {
        explored[i] = 1;
        d.exploredVersion++;
      }
    }
  }
}

/** Reveals a whole room and its wall ring. */
export function revealRoom(d: DungeonState, room: number): void {
  const { map, roomAt, explored } = d.floor;
  for (let i = 0; i < roomAt.length; i++) {
    if (roomAt[i] !== room) continue;
    const tx = i % map.width;
    const ty = (i - tx) / map.width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (map.inBounds(tx + dx, ty + dy)) explored[(ty + dy) * map.width + tx + dx] = 1;
      }
    }
  }
  d.exploredVersion++;
}

export function revealAll(d: DungeonState): void {
  d.floor.explored.fill(1);
  d.exploredVersion++;
}

function setDoors(sim: Sim, room: Room, tile: Tile): void {
  for (const door of room.doors) sim.map.set(door.tx, door.ty, tile);
}

/** Pushes bodies standing in door tiles into the room before the doors close. */
function evictFromDoors(sim: Sim, floor: Floor, room: Room): void {
  const s = sim.map.tileSize;
  for (const [, t, b] of sim.world.query('transform', 'body')) {
    const blocked = room.doors.some(
      (d) =>
        Math.abs(t.x - (d.tx + 0.5) * s) < s / 2 + b.radius &&
        Math.abs(t.y - (d.ty + 0.5) * s) < s / 2 + b.radius,
    );
    if (!blocked) continue;
    const c = sim.map.tileCenter(room.center.tx, room.center.ty);
    if (roomIdAt(floor, Math.floor(t.x / s), Math.floor(t.y / s)) !== room.id) {
      t.x = t.prevX = c.x;
      t.y = t.prevY = c.y;
    }
  }
}

function startEncounter(sim: Sim, d: DungeonState, room: Room, level: number): void {
  const state = d.rooms[room.id];
  if (!state) return;
  state.active = true;
  const pt = sim.world.req(sim.player, 'transform');
  const { map } = sim;
  const s = map.tileSize;
  const minDist = DUNGEON.encounter.minSpawnTiles * s;
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < d.floor.roomAt.length; i++) {
    if (d.floor.roomAt[i] !== room.id) continue;
    const tx = i % map.width;
    const ty = (i - tx) / map.width;
    // Keep spawns off walls so bodies never start inside one.
    const nearWall =
      map.isSolid(tx, ty) ||
      map.isSolid(tx + 1, ty) ||
      map.isSolid(tx - 1, ty) ||
      map.isSolid(tx, ty + 1) ||
      map.isSolid(tx, ty - 1);
    if (nearWall) continue;
    const c = map.tileCenter(tx, ty);
    if (Math.hypot(c.x - pt.x, c.y - pt.y) >= minDist) spots.push(c);
  }
  if (spots.length === 0) spots.push(map.tileCenter(room.center.tx, room.center.ty));
  sim.rng.spawn.shuffle(spots);
  const list = rollEncounter(sim.rng.spawn, d.floor, room);
  list.forEach((spec, i) => {
    const spot = spots[i % spots.length];
    if (!spot) return;
    const e: Entity = spawnEnemy(sim, spec.id, spot.x, spot.y, { elite: spec.elite, level });
    sim.world.add(e, 'encounter', { room: room.id });
    if (spec.champion) sim.world.add(e, 'champion', { name: spec.champion });
  });
  // Design 2c: only mini-boss and boss rooms lock their doors.
  if (room.type === 'miniboss' || room.type === 'boss') {
    evictFromDoors(sim, d.floor, room);
    setDoors(sim, room, Tile.DoorClosed);
    sim.events.push({ type: 'doorsLocked', room: room.id });
  }
  if (list.length === 0) finishEncounter(sim, d, room);
}

function finishEncounter(sim: Sim, d: DungeonState, room: Room): void {
  const state = d.rooms[room.id];
  if (!state) return;
  state.active = false;
  state.cleared = true;
  if (room.type === 'miniboss' || room.type === 'boss') setDoors(sim, room, Tile.DoorOpen);
  sim.events.push({ type: 'roomCleared', room: room.id, roomType: room.type });
  if (room.type === 'boss') {
    d.stairs = { ...room.center };
    sim.map.set(room.center.tx, room.center.ty, Tile.Stairs);
    const c = sim.map.tileCenter(room.center.tx, room.center.ty);
    sim.events.push({ type: 'stairsOpen', x: c.x, y: c.y });
  }
}

/** True once the player is clear of every door of the room (so doors never close on them). */
function deepInside(sim: Sim, room: Room, x: number, y: number): boolean {
  const s = sim.map.tileSize;
  return room.doors.every(
    (dr) => Math.hypot((dr.tx + 0.5) * s - x, (dr.ty + 0.5) * s - y) > s * 1.5,
  );
}

/** Room entry, encounters, door locks, clearing, stairs and fog of war. */
export function updateDungeon(sim: Sim, d: DungeonState, level: number): void {
  const pt = sim.world.get(sim.player, 'transform');
  if (!pt || !sim.playerAlive) return;
  const s = sim.map.tileSize;
  const tx = Math.floor(pt.x / s);
  const ty = Math.floor(pt.y / s);
  const tileIdx = ty * sim.map.width + tx;
  if (tileIdx !== d.lastTile) {
    d.lastTile = tileIdx;
    reveal(sim, d, pt.x, pt.y);
    // Only stepping onto the stairs descends (not standing there when they appear).
    if (sim.map.get(tx, ty) === Tile.Stairs) d.descendRequested = true;
  }

  const roomId = roomIdAt(d.floor, tx, ty);
  if (roomId !== d.currentRoom) {
    d.currentRoom = roomId;
    const room = d.floor.rooms[roomId];
    const state = d.rooms[roomId];
    if (room && state) {
      sim.events.push({
        type: 'roomEnter',
        room: roomId,
        roomType: room.type,
        firstVisit: !state.visited,
      });
      if (!state.visited) revealRoom(d, roomId);
      state.visited = true;
    }
  }

  const room = d.floor.rooms[roomId];
  const state = d.rooms[roomId];
  if (room && state && !state.cleared && !state.active && deepInside(sim, room, pt.x, pt.y)) {
    startEncounter(sim, d, room, level);
  }

  for (const r of d.floor.rooms) {
    const st = d.rooms[r.id];
    if (!st?.active) continue;
    const alive = sim.world
      .query('encounter')
      .some(([e, enc]) => enc.room === r.id && !sim.world.isPendingDestroy(e));
    if (!alive) finishEncounter(sim, d, r);
  }
}

/** Player hitboxes break cracked walls, opening the secret room. */
export function breakCrackedWalls(sim: Sim, d: DungeonState): void {
  const cracked = d.floor.cracked.filter((c) => sim.map.get(c.tx, c.ty) === Tile.Cracked);
  if (cracked.length === 0) return;
  const s = sim.map.tileSize;
  for (const [, hb, t] of sim.world.query('hitbox', 'transform')) {
    if (hb.team !== 'player' || hb.delay > 0) continue;
    const hit = cracked.find((c) =>
      shapeHitsCircle(hb.shape, t.x, t.y, hb.angle, (c.tx + 0.5) * s, (c.ty + 0.5) * s, s / 2),
    );
    if (!hit) continue;
    for (const c of d.floor.cracked) sim.map.set(c.tx, c.ty, Tile.Floor);
    sim.events.push({ type: 'secretFound', x: (hit.tx + 0.5) * s, y: (hit.ty + 0.5) * s });
    if (d.floor.secretRoom >= 0) revealRoom(d, d.floor.secretRoom);
    return;
  }
}

/** Debug/test helper: is every room of the floor reachable from the spawn right now? */
export function reachableFromSpawn(floor: Floor): Uint8Array {
  return floodFill(floor.map, floor.spawn, (x, y) => !floor.map.isSolid(x, y));
}
