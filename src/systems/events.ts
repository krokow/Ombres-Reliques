import { findFreeSpot, Tile } from '../core/tilemap';
import { BIOMES, floorInBiome } from '../data/biomes';
import { ELITE_MODIFIERS, type EliteModifierId } from '../data/elites';
import { EVENT_TEXT, FLOOR_EVENTS, type FloorEventKind } from '../data/events';
import { CONSUMABLES, type ConsumableId } from '../data/items';
import type { Room } from '../dungeon/floor';
import { transformAt, type Interactable, type ShopOffer } from '../ecs/components';
import type { Entity } from '../ecs/world';
import { spawnEnemy } from '../game/factories';
import type { Sim } from '../game/sim';
import {
  evictFromDoors,
  setDoors,
  spawnWave,
  type DungeonState,
  type EncounterSpawn,
} from './dungeon';
import { generateItem, shopPrice, spawnPickup } from './loot';
import { applyStatus } from './statuses';

/** Run-time state of one random floor event. */
export interface FloorEventState {
  kind: FloorEventKind;
  room: number;
  phase: 'pending' | 'active' | 'done';
  /** Rift countdown (ticks). */
  timer: number;
}

function roomSpot(sim: Sim, room: Room, dx = 0, dy = 0): { x: number; y: number } {
  const c = sim.map.tileCenter(room.center.tx, room.center.ty);
  return findFreeSpot(sim.map, c.x + dx, c.y + dy, 14, 96) ?? c;
}

function announce(sim: Sim, kind: FloorEventKind, x: number, y: number, text?: string): void {
  sim.events.push({ type: 'floorEvent', kind, x, y, text: text ?? EVENT_TEXT[kind] });
}

function addInteractable(sim: Sim, x: number, y: number, data: Interactable): Entity {
  const e = sim.world.create();
  sim.world.add(e, 'transform', transformAt(x, y));
  sim.world.add(e, 'interactable', data);
  return e;
}

/** Rolls this floor's events (seeded, loot stream) and places their props. */
export function setupFloorEvents(sim: Sim, d: DungeonState): void {
  const rng = sim.rng.loot;
  const level = d.floor.level;
  const candidates = d.floor.rooms.filter((r) => r.type === 'combat' && r.id !== d.floor.startRoom);
  const [min, max] = FLOOR_EVENTS.perFloor;
  const count = Math.min(candidates.length, level === 1 ? 1 : rng.int(min, max));
  const rooms = rng.shuffle([...candidates]).slice(0, count);
  const used = new Set<FloorEventKind>();
  for (const room of rooms) {
    const pool = FLOOR_EVENTS.pool.filter(
      (p) => p.minFloor <= floorInBiome(level) + (level > 3 ? 3 : 0) && !used.has(p.kind),
    );
    if (pool.length === 0) break;
    const kind = rng.weighted(pool.map((p) => ({ weight: p.weight, value: p.kind })));
    used.add(kind);
    d.events.push({ kind, room: room.id, phase: 'pending', timer: 0 });
    if (kind === 'mimic') {
      const p = roomSpot(sim, room, 40, 0);
      addInteractable(sim, p.x, p.y, {
        kind: 'chest',
        locked: false,
        opened: false,
        room: room.id,
        mimic: true,
      });
    } else if (kind === 'fountain') {
      const p = roomSpot(sim, room, 0, 0);
      addInteractable(sim, p.x, p.y, { kind: 'fountain', used: false, room: room.id });
    }
  }
}

function eventFor(
  d: DungeonState,
  room: number,
  kind?: FloorEventKind,
): FloorEventState | undefined {
  return d.events.find((ev) => ev.room === room && (kind === undefined || ev.kind === kind));
}

function rollFromBiome(
  sim: Sim,
  d: DungeonState,
  n: number,
  eliteFirst: boolean,
): EncounterSpawn[] {
  const biome = BIOMES[d.floor.biome];
  const inBiome = floorInBiome(d.floor.level);
  const pool = biome.roster
    .filter((p) => p.minFloor <= inBiome)
    .map((p) => ({ weight: p.weight, value: p.id }));
  const mods = Object.keys(ELITE_MODIFIERS) as EliteModifierId[];
  return Array.from({ length: n }, (_, i) => ({
    id: sim.rng.spawn.weighted(pool),
    elite: eliteFirst && i === 0 ? [sim.rng.spawn.pick(mods)] : [],
  }));
}

/** A room's fight starts: rifts open their countdown and bring extra enemies. */
export function onEncounterStart(sim: Sim, d: DungeonState, room: Room, level: number): void {
  const ev = eventFor(d, room.id, 'rift');
  if (!ev || ev.phase !== 'pending') return;
  ev.phase = 'active';
  ev.timer = FLOOR_EVENTS.rift.timeTicks;
  spawnWave(sim, d, room, rollFromBiome(sim, d, FLOOR_EVENTS.rift.extraEnemies, true), level);
  const p = roomSpot(sim, room);
  announce(sim, 'rift', p.x, p.y);
}

function rewardChest(sim: Sim, x: number, y: number, room: number): void {
  addInteractable(sim, x, y, { kind: 'chest', locked: false, opened: false, room });
}

/**
 * The room's enemies are all down. Returns true when an event keeps the
 * fight going (ambush wave, mimic) so the room isn't marked cleared yet.
 */
export function onRoomCleared(sim: Sim, d: DungeonState, room: Room, level: number): boolean {
  const ev = eventFor(d, room.id);
  if (!ev || ev.phase === 'done') return false;
  const p = roomSpot(sim, room);
  switch (ev.kind) {
    case 'ambush': {
      if (ev.phase === 'pending') {
        ev.phase = 'active';
        const a = FLOOR_EVENTS.ambush;
        const n = a.base + Math.floor(level / a.floorsPerExtra);
        spawnWave(sim, d, room, rollFromBiome(sim, d, n, true), level);
        evictFromDoors(sim, d.floor, room);
        setDoors(sim, room, Tile.DoorClosed);
        announce(sim, 'ambush', p.x, p.y);
        sim.events.push({ type: 'doorsLocked', room: room.id });
        return true;
      }
      ev.phase = 'done';
      setDoors(sim, room, Tile.DoorOpen);
      const [gMin, gMax] = FLOOR_EVENTS.ambush.rewardGold;
      spawnPickup(sim, p.x, p.y, { kind: 'gold', amount: sim.rng.loot.int(gMin, gMax), age: 0 });
      spawnPickup(sim, p.x, p.y, {
        kind: 'consumable',
        id: sim.rng.loot.pick(Object.keys(CONSUMABLES) as ConsumableId[]),
        age: 0,
      });
      announce(sim, 'ambush', p.x, p.y, 'Embuscade repoussée !');
      return false;
    }
    case 'mimic':
      if (ev.phase !== 'active') return false;
      ev.phase = 'done';
      spawnPickup(sim, p.x, p.y, {
        kind: 'item',
        item: generateItem(sim.rng.loot, level, { minRarity: 'epic' }),
        age: 0,
      });
      spawnPickup(sim, p.x, p.y, { kind: 'gold', amount: sim.rng.loot.int(40, 80), age: 0 });
      return false;
    case 'rift':
      if (ev.phase !== 'active') return false;
      ev.phase = 'done';
      rewardChest(sim, p.x, p.y, room.id);
      announce(sim, 'rift', p.x, p.y, 'Faille scellée : un coffre apparaît !');
      return false;
    case 'merchant': {
      ev.phase = 'done';
      const m = FLOOR_EVENTS.merchant;
      const rng = sim.rng.loot;
      const offers: ShopOffer[] = [
        { type: 'item', item: generateItem(rng, level, { minRarity: 'rare' }) },
        { type: 'item', item: generateItem(rng, level) },
        { type: 'consumable', id: rng.pick(Object.keys(CONSUMABLES) as ConsumableId[]) },
      ].slice(0, m.offers) as ShopOffer[];
      offers.forEach((offer, i) => {
        const at = roomSpot(sim, room, (i - (offers.length - 1) / 2) * 40, 0);
        addInteractable(sim, at.x, at.y, {
          kind: 'shop',
          offer,
          price: Math.max(1, Math.round(shopPrice(offer, level) * (1 - m.discount))),
          sold: false,
          room: room.id,
        });
      });
      announce(sim, 'merchant', p.x, p.y);
      return false;
    }
    case 'fountain':
      return false;
  }
}

/** Rift countdowns. */
export function tickFloorEvents(sim: Sim, d: DungeonState): void {
  for (const ev of d.events) {
    if (ev.kind !== 'rift' || ev.phase !== 'active') continue;
    if (--ev.timer > 0) continue;
    ev.phase = 'done';
    const room = d.floor.rooms[ev.room];
    if (room) {
      const p = roomSpot(sim, room);
      announce(sim, 'rift', p.x, p.y, 'La faille se referme…');
    }
  }
}

/** Opening a mimic chest: it was hungry. */
export function triggerMimic(sim: Sim, chest: Entity): void {
  const d = sim.dungeon;
  const it = sim.world.get(chest, 'interactable');
  const t = sim.world.get(chest, 'transform');
  if (!d || !it || it.kind !== 'chest' || !t) return;
  const ev = eventFor(d, it.room, 'mimic');
  sim.world.destroy(chest);
  const e = spawnEnemy(sim, 'mimic', t.x, t.y, { level: sim.level });
  sim.world.add(e, 'encounter', { room: it.room });
  sim.world.add(e, 'champion', { name: 'Mimique' });
  const state = d.rooms[it.room];
  if (state) {
    state.active = true;
    state.cleared = false;
  }
  if (ev) ev.phase = 'active';
  announce(sim, 'mimic', t.x, t.y);
}

/** Drinking from a fountain: a seeded gamble. */
export function useFountain(sim: Sim, fountain: Entity): void {
  const w = sim.world;
  const it = w.get(fountain, 'interactable');
  const t = w.get(fountain, 'transform');
  if (!it || it.kind !== 'fountain' || it.used || !t) return;
  it.used = true;
  const f = FLOOR_EVENTS.fountain;
  const rng = sim.rng.loot;
  const outcome = rng.weighted(f.outcomes.map((o) => ({ weight: o.weight, value: o.id })));
  const party = w.req(sim.player, 'party');
  switch (outcome) {
    case 'heal':
      for (const m of party.members)
        if (!m.ko)
          m.health.hp = Math.min(m.health.max, m.health.hp + m.health.max * f.healFraction);
      announce(sim, 'fountain', t.x, t.y, 'Eaux apaisantes : l’équipe est soignée');
      break;
    case 'blessing':
      applyStatus(sim, sim.player, 'empowered', f.blessingTicks);
      announce(sim, 'fountain', t.x, t.y, 'Bénédiction : +25 % de dégâts');
      break;
    case 'gold': {
      const [a, b] = f.gold;
      spawnPickup(sim, t.x, t.y, { kind: 'gold', amount: rng.int(a, b), age: 0 });
      announce(sim, 'fountain', t.x, t.y, 'Des pièces au fond du bassin');
      break;
    }
    case 'guarded': {
      const d = sim.dungeon;
      const room = d?.floor.rooms[it.room];
      if (d && room) {
        spawnWave(sim, d, room, rollFromBiome(sim, d, f.guardians, false), sim.level);
        const state = d.rooms[room.id];
        if (state) {
          state.active = true;
          state.cleared = false;
        }
      }
      announce(sim, 'fountain', t.x, t.y, 'La fontaine était gardée !');
      break;
    }
  }
  sim.events.push({ type: 'consumable', id: 'potion', x: t.x, y: t.y });
}
