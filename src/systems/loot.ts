import type { Rng } from '../core/rng';
import { enemyDef } from '../data/enemies';
import {
  AFFIXES,
  CONSUMABLES,
  ITEM_BASES,
  LOOT,
  RARITIES,
  RARITY_FLOOR_BOOST,
  RARITY_ORDER,
  RELICS,
  SLOT_IMPLICIT,
  isCurse,
  type ConsumableId,
  type ItemSlot,
  type Rarity,
  type RelicId,
} from '../data/items';
import { TEAM } from '../data/team';
import type { Floor } from '../dungeon/floor';
import {
  transformAt,
  type Interactable,
  type Item,
  type Pickup,
  type ShopOffer,
} from '../ecs/components';
import type { Entity } from '../ecs/world';
import { spawnExplosion } from '../game/factories';
import type { Sim } from '../game/sim';
import { dealDamage } from './damage';
import { enemiesAround } from './player';
import { activeMods, recomputeAll } from './progression';
import { applyStatus } from './statuses';
import { koMembers, reviveAll } from './team';

// ---------------------------------------------------------------- generation

export function rollRarity(rng: Rng, level: number, min: Rarity = 'common'): Rarity {
  const minIndex = RARITY_ORDER.indexOf(min);
  return rng.weighted(
    RARITY_ORDER.filter((_, i) => i >= minIndex).map((r) => ({
      weight: RARITIES[r].weight * (1 + RARITY_FLOOR_BOOST[r] * (level - 1)),
      value: r,
    })),
  );
}

/** Rolls a piece of equipment: implicit stat(s) by slot + N distinct affixes by rarity. */
export function generateItem(
  rng: Rng,
  level: number,
  opts: { slot?: ItemSlot; minRarity?: Rarity } = {},
): Item {
  const slot = opts.slot ?? rng.pick<ItemSlot>(['weapon', 'armor', 'relic']);
  const rarity = rollRarity(rng, level, opts.minRarity);
  const r = RARITIES[rarity];
  const stats: Item['stats'] = SLOT_IMPLICIT[slot].map((imp) => ({
    stat: imp.stat,
    value: round3((imp.base + imp.perLevel * level) * r.statMult),
  }));
  // Relics have no implicit: their first affix counts double.
  const affixCount = r.affixes + (slot === 'relic' ? 1 : 0);
  const rank = RARITY_ORDER.indexOf(rarity);
  const pool = AFFIXES.filter((a) => RARITY_ORDER.indexOf(a.minRarity ?? 'common') <= rank);
  for (let i = 0; i < affixCount && pool.length > 0; i++) {
    const affix = rng.weighted(pool.map((a) => ({ weight: a.weight, value: a })));
    pool.splice(pool.indexOf(affix), 1);
    const raw =
      rng.range(affix.min, affix.max) * r.statMult * (slot === 'relic' && i === 0 ? 2 : 1);
    const value = affix.integer ? Math.max(1, Math.round(affix.min)) : round3(raw);
    const existing = stats.find((s) => s.stat === affix.stat);
    if (existing) existing.value = round3(existing.value + value);
    else stats.push({ stat: affix.stat, value });
  }
  const name = rng.pick(ITEM_BASES[slot].names);
  return { slot, name, rarity, level, stats };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function itemValue(item: Item): number {
  return Math.round(RARITIES[item.rarity].value * (1 + LOOT.valuePerLevel * (item.level - 1)));
}

function party(sim: Sim) {
  return sim.world.req(sim.player, 'party');
}

// ---------------------------------------------------------------- pickups

export function spawnPickup(
  sim: Sim,
  x: number,
  y: number,
  pickup: Pickup,
  scatter = true,
): Entity {
  const w = sim.world;
  const e = w.create();
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'velocity', { x: 0, y: 0 });
  // A little hop away from where it dropped (render-friendly, collides with walls).
  const a = scatter ? sim.rng.loot.range(-Math.PI, Math.PI) : 0;
  const s = scatter ? sim.rng.loot.range(60, 160) : 0;
  w.add(e, 'impulse', { x: Math.cos(a) * s, y: Math.sin(a) * s });
  w.add(e, 'body', { radius: 5, solid: true, pushable: false, weight: 1 });
  w.add(e, 'pickup', pickup);
  return e;
}

/** Death drops: gold always, sometimes keys, consumables or equipment. */
export function dropLoot(sim: Sim, target: Entity): void {
  const w = sim.world;
  const t = w.get(target, 'transform');
  const ai = w.get(target, 'enemy');
  if (!t || !ai) return;
  const rng = sim.rng.loot;
  const level = sim.level;
  const champion = w.get(target, 'champion');
  const elite = w.has(target, 'elite') || champion !== undefined;
  const gold = Math.max(
    1,
    Math.round(enemyDef(ai.defId).xp * LOOT.goldPerXp * (elite ? 3 : 1) * rng.range(0.7, 1.3)),
  );
  spawnPickup(sim, t.x, t.y, { kind: 'gold', amount: gold, age: 0 });
  const table = elite ? LOOT.drops.elite : LOOT.drops.normal;
  if (rng.chance(table.key)) spawnPickup(sim, t.x, t.y, { kind: 'key', age: 0 });
  if (rng.chance(table.consumable)) {
    spawnPickup(sim, t.x, t.y, {
      kind: 'consumable',
      id: rng.pick(Object.keys(CONSUMABLES) as ConsumableId[]),
      age: 0,
    });
  }
  if (champion) {
    const boss = championIsBoss(sim, target);
    spawnPickup(sim, t.x, t.y, {
      kind: 'item',
      item: generateItem(rng, level, { minRarity: boss ? 'epic' : 'rare' }),
      age: 0,
    });
    if (boss) spawnPickup(sim, t.x, t.y, { kind: 'relic', id: rollRelic(sim, false), age: 0 });
  } else if (rng.chance(table.item)) {
    spawnPickup(sim, t.x, t.y, { kind: 'item', item: generateItem(rng, level), age: 0 });
  }
}

function championIsBoss(sim: Sim, e: Entity): boolean {
  const enc = sim.world.get(e, 'encounter');
  const d = sim.dungeon;
  return enc !== undefined && d !== null && d.floor.rooms[enc.room]?.type === 'boss';
}

/** A relic the party doesn't own yet (curses only when asked for). */
export function rollRelic(sim: Sim, curse: boolean): RelicId {
  const owned = new Set(party(sim).relics);
  const pool = (Object.keys(RELICS) as RelicId[]).filter(
    (id) => isCurse(id) === curse && !owned.has(id),
  );
  const all = (Object.keys(RELICS) as RelicId[]).filter((id) => isCurse(id) === curse);
  return sim.rng.loot.pick(pool.length > 0 ? pool : all);
}

export function addRelic(sim: Sim, id: RelicId): void {
  const p = party(sim);
  if (!p.relics.includes(id)) p.relics.push(id);
  recomputeAll(sim);
  if (id === 'lantern' && sim.dungeon) {
    sim.dungeon.floor.explored.fill(1);
    sim.dungeon.exploredVersion++;
  }
  const t = sim.world.req(sim.player, 'transform');
  sim.events.push({ type: 'relic', id, x: t.x, y: t.y });
}

function addConsumable(sim: Sim, id: ConsumableId): boolean {
  const quick = party(sim).quick;
  const same = quick.find((q) => q?.id === id && q.count < LOOT.maxStack);
  if (same) {
    same.count++;
    return true;
  }
  const free = quick.findIndex((q) => q === null);
  if (free < 0) return false;
  quick[free] = { id, count: 1 };
  return true;
}

/** Coins, keys and consumables fly to the player and are collected on contact. */
export function updatePickups(sim: Sim): void {
  const w = sim.world;
  const pt = w.get(sim.player, 'transform');
  if (!pt || !sim.playerAlive) return;
  const p = party(sim);
  for (const [e, pk, t, v] of w.query('pickup', 'transform', 'velocity')) {
    pk.age++;
    if (pk.kind === 'item' || pk.kind === 'relic' || pk.age < 20) continue;
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d > LOOT.magnetRadius) {
      v.x = 0;
      v.y = 0;
      continue;
    }
    if (d <= LOOT.pickupRadius) {
      let label = '';
      if (pk.kind === 'gold') {
        const gain = Math.max(1, Math.round(pk.amount * (1 + activeMods(sim).goldPct)));
        p.gold += gain;
        label = `+${gain} or`;
      } else if (pk.kind === 'key') {
        p.keys++;
        label = '+1 clé';
      } else if (pk.kind === 'consumable') {
        if (!addConsumable(sim, pk.id)) continue; // no room: leave it there
        label = CONSUMABLES[pk.id].name;
      }
      w.destroy(e);
      sim.events.push({ type: 'pickup', kind: pk.kind, x: t.x, y: t.y, label });
      continue;
    }
    const speed = 380;
    v.x = (dx / d) * speed;
    v.y = (dy / d) * speed;
  }
}

/** Item/relic pickup close enough to be inspected (design 1b: comparison shows, no pause). */
export function nearestInspectable(sim: Sim): Entity | null {
  const pt = sim.world.get(sim.player, 'transform');
  if (!pt) return null;
  let best: Entity | null = null;
  let bestD: number = LOOT.inspectRadius;
  for (const [e, pk, t] of sim.world.query('pickup', 'transform')) {
    if (pk.kind !== 'item' && pk.kind !== 'relic') continue;
    const d = Math.hypot(t.x - pt.x, t.y - pt.y);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function nearestInteractable(sim: Sim): Entity | null {
  const pt = sim.world.get(sim.player, 'transform');
  if (!pt) return null;
  let best: Entity | null = null;
  let bestD: number = LOOT.interactRadius;
  for (const [e, it, t] of sim.world.query('interactable', 'transform')) {
    if ((it.kind === 'chest' && it.opened) || (it.kind === 'shop' && it.sold)) continue;
    const d = Math.hypot(t.x - pt.x, t.y - pt.y);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

// ---------------------------------------------------------------- floor setup

function spawnInteractable(sim: Sim, x: number, y: number, data: Interactable): Entity {
  const e = sim.world.create();
  sim.world.add(e, 'transform', transformAt(x, y));
  sim.world.add(e, 'interactable', data);
  return e;
}

export function shopPrice(offer: ShopOffer, level: number): number {
  const base =
    offer.type === 'item'
      ? itemValue(offer.item) * LOOT.shop.itemMult
      : offer.type === 'consumable'
        ? LOOT.shop[offer.id]
        : offer.type === 'relic'
          ? LOOT.shop.relic
          : LOOT.shop.key;
  return Math.round(base * (1 + LOOT.shop.perFloor * (level - 1)));
}

/** Chests, shop pedestals and altars of a freshly generated floor (seeded by the loot stream). */
export function setupFloorLoot(sim: Sim, floor: Floor): void {
  const rng = sim.rng.loot;
  for (const room of floor.rooms) {
    const c = floor.map.tileCenter(room.center.tx, room.center.ty);
    const x = c.x + floor.map.tileSize / 2;
    const y = c.y + floor.map.tileSize / 2;
    if (room.type === 'treasure')
      spawnInteractable(sim, x, y, { kind: 'chest', locked: true, opened: false, room: room.id });
    if (room.type === 'secret')
      spawnInteractable(sim, x, y, { kind: 'chest', locked: false, opened: false, room: room.id });
    if (room.type === 'altar')
      spawnInteractable(sim, x, y, { kind: 'altar', used: false, room: room.id });
    if (room.type === 'shop') {
      const offers: ShopOffer[] = [
        { type: 'item', item: generateItem(rng, floor.level, { minRarity: 'rare' }) },
        { type: 'item', item: generateItem(rng, floor.level) },
        { type: 'consumable', id: rng.pick(Object.keys(CONSUMABLES) as ConsumableId[]) },
        rng.chance(0.5) ? { type: 'relic', id: rollRelic(sim, false) } : { type: 'key' },
      ];
      offers.forEach((offer, i) => {
        spawnInteractable(sim, x + (i - 1.5) * 40, y, {
          kind: 'shop',
          offer,
          price: shopPrice(offer, floor.level),
          sold: false,
          room: room.id,
        });
      });
    }
  }
}

// ---------------------------------------------------------------- interaction (E)

export type AltarOption = 'revive' | 'sacrifice' | 'pact';

export function altarOptions(sim: Sim): AltarOption[] {
  return koMembers(sim).length > 0 ? ['revive', 'sacrifice', 'pact'] : ['sacrifice', 'pact'];
}

/** E key: relic pickup first, then the nearest chest / shop pedestal / altar. */
export function interact(sim: Sim): void {
  const w = sim.world;
  const t = w.req(sim.player, 'transform');
  const p = party(sim);
  const near = nearestInspectable(sim);
  const pk = near !== null ? w.get(near, 'pickup') : undefined;
  if (near !== null && pk?.kind === 'relic') {
    w.destroy(near);
    addRelic(sim, pk.id);
    return;
  }
  const e = nearestInteractable(sim);
  if (e === null) return;
  const it = w.req(e, 'interactable');
  const at = w.req(e, 'transform');
  const fail = (reason: string): void => {
    sim.events.push({ type: 'interactFail', x: t.x, y: t.y, reason });
  };
  if (it.kind === 'chest') {
    if (it.locked) {
      if (p.keys <= 0) return fail('Il faut une clé');
      p.keys--;
    }
    it.opened = true;
    const rng = sim.rng.loot;
    const [gMin, gMax] = LOOT.chest.gold;
    spawnPickup(sim, at.x, at.y, { kind: 'gold', amount: rng.int(gMin, gMax), age: 0 });
    spawnPickup(sim, at.x, at.y, {
      kind: 'item',
      item: generateItem(rng, sim.level, { minRarity: it.locked ? 'epic' : LOOT.chest.minRarity }),
      age: 0,
    });
    spawnPickup(sim, at.x, at.y, {
      kind: 'consumable',
      id: rng.pick(Object.keys(CONSUMABLES) as ConsumableId[]),
      age: 0,
    });
    sim.events.push({ type: 'chestOpen', x: at.x, y: at.y });
  } else if (it.kind === 'shop') {
    if (p.gold < it.price) return fail('Pas assez d’or');
    p.gold -= it.price;
    it.sold = true;
    const o = it.offer;
    if (o.type === 'item')
      spawnPickup(sim, t.x, t.y + 20, { kind: 'item', item: o.item, age: 0 }, false);
    else if (o.type === 'consumable') {
      if (!addConsumable(sim, o.id))
        spawnPickup(sim, t.x, t.y + 20, { kind: 'consumable', id: o.id, age: 0 }, false);
    } else if (o.type === 'relic') addRelic(sim, o.id);
    else p.keys++;
    sim.events.push({ type: 'purchase', x: at.x, y: at.y, price: it.price });
  } else {
    if (it.used) return fail('L’autel est éteint');
    sim.events.push({ type: 'altarOpen', altar: e, options: altarOptions(sim) });
  }
}

/** Altar choices (from the altar panel). Single use per altar. */
export function useAltar(sim: Sim, option: AltarOption): boolean {
  const w = sim.world;
  const e = nearestInteractable(sim);
  const it = e !== null ? w.get(e, 'interactable') : undefined;
  if (!it || it.kind !== 'altar' || it.used || !altarOptions(sim).includes(option)) return false;
  const p = party(sim);
  const active = p.members[p.active];
  if (!active) return false;
  const t = w.req(sim.player, 'transform');
  if (option === 'revive') {
    const h = active.health;
    h.hp = Math.max(1, Math.round(h.hp - h.max * TEAM.altarRevive.hpCostFraction));
    reviveAll(sim, TEAM.altarRevive.reviveFraction);
  } else if (option === 'sacrifice') {
    // Blood for power: the active character loses max HP for the run, the party gains a relic.
    active.scars++;
    recomputeAll(sim);
    addRelic(sim, rollRelic(sim, false));
  } else {
    spawnPickup(
      sim,
      t.x,
      t.y + 24,
      {
        kind: 'item',
        item: generateItem(sim.rng.loot, sim.level, { minRarity: 'legendary' }),
        age: 0,
      },
      false,
    );
    addRelic(sim, rollRelic(sim, true));
  }
  it.used = true;
  sim.events.push({ type: 'altarUsed', option, x: t.x, y: t.y });
  return true;
}

// ---------------------------------------------------------------- equipment (comparison panel)

/** Equips the item lying at `itemEntity` on party member `member`; the old piece drops. */
export function equipItem(sim: Sim, itemEntity: Entity, member: number): boolean {
  const w = sim.world;
  const pk = w.get(itemEntity, 'pickup');
  const p = party(sim);
  const m = p.members[member];
  if (!pk || pk.kind !== 'item' || !m || nearestInspectable(sim) !== itemEntity) return false;
  const t = w.req(itemEntity, 'transform');
  const old = m.equipment[pk.item.slot];
  m.equipment[pk.item.slot] = pk.item;
  w.destroy(itemEntity);
  if (old) spawnPickup(sim, t.x, t.y, { kind: 'item', item: old, age: 0 });
  recomputeAll(sim);
  sim.events.push({
    type: 'equip',
    classId: m.classId,
    name: pk.item.name,
    rarity: pk.item.rarity,
    x: t.x,
    y: t.y,
  });
  return true;
}

export function salvageItem(sim: Sim, itemEntity: Entity): boolean {
  const w = sim.world;
  const pk = w.get(itemEntity, 'pickup');
  if (!pk || pk.kind !== 'item' || nearestInspectable(sim) !== itemEntity) return false;
  const t = w.req(itemEntity, 'transform');
  const value = itemValue(pk.item);
  party(sim).gold += value;
  w.destroy(itemEntity);
  sim.events.push({ type: 'pickup', kind: 'gold', x: t.x, y: t.y, label: `+${value} or` });
  return true;
}

// ---------------------------------------------------------------- consumables (F / G)

export function useConsumable(sim: Sim, slot: number, aimX: number, aimY: number): boolean {
  const p = party(sim);
  const q = p.quick[slot];
  if (!q) return false;
  const w = sim.world;
  const t = w.req(sim.player, 'transform');
  if (q.id === 'potion') {
    const h = w.req(sim.player, 'health');
    if (h.hp >= h.max) return false;
    h.hp = Math.min(h.max, h.hp + h.max * CONSUMABLES.potion.heal);
  } else if (q.id === 'bomb') {
    // A real bomb: neutral blast after a fuse, it can hurt you too (and breaks cracked walls).
    const b = CONSUMABLES.bomb;
    const dx = aimX - t.x;
    const dy = aimY - t.y;
    const d = Math.hypot(dx, dy);
    const k = d > b.range ? b.range / d : 1;
    spawnExplosion(sim, sim.player, t.x + dx * k, t.y + dy * k, {
      radius: b.radius,
      damage: b.damage,
      knockback: 320,
      delayTicks: b.fuseTicks,
      creditPlayer: true,
    });
  } else {
    const s = CONSUMABLES.thunder;
    for (const e of enemiesAround(sim, t.x, t.y, s.radius)) {
      const et = w.req(e, 'transform');
      const a = Math.atan2(et.y - t.y, et.x - t.x);
      applyStatus(sim, e, 'stun', s.stunTicks, sim.player);
      dealDamage(sim, e, {
        amount: s.damage,
        source: sim.player,
        byPlayer: true,
        crit: false,
        backstab: false,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
        knockback: 100,
        stagger: 10,
        dot: false,
        originX: t.x,
        originY: t.y,
      });
    }
  }
  q.count--;
  if (q.count <= 0) p.quick[slot] = null;
  sim.events.push({ type: 'consumable', id: q.id, x: t.x, y: t.y });
  return true;
}
