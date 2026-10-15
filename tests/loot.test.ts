import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Tile } from '../src/core/tilemap';
import { SHADOW_BLADE } from '../src/data/classes';
import { CONSUMABLES, LOOT, RARITIES, RARITY_ORDER, RELICS } from '../src/data/items';
import { ENEMIES } from '../src/data/enemies';
import type { Item } from '../src/ecs/components';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { dealDamage } from '../src/systems/damage';
import { addRelic, generateItem, itemValue, rollRarity, spawnPickup } from '../src/systems/loot';
import { hasStatus } from '../src/systems/statuses';
import { DT, place, run, runCollect, sandbox, SPAWN } from './helpers';

const party = (g: Game) => g.world.req(g.player, 'party');

const hit = (g: Game, target: number, amount: number) =>
  dealDamage(g, target, {
    amount,
    source: g.player,
    byPlayer: true,
    crit: false,
    backstab: false,
    dirX: 1,
    dirY: 0,
    knockback: 0,
    stagger: 0,
    dot: false,
    originX: 0,
    originY: 0,
  });

const lethalOnPlayer = (g: Game) =>
  dealDamage(g, g.player, {
    amount: 99999,
    source: null,
    byPlayer: false,
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

describe('item generation', () => {
  it('is seeded and respects rarity affix counts', () => {
    expect(generateItem(new Rng(1), 3)).toEqual(generateItem(new Rng(1), 3));
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) {
      const item = generateItem(rng, 1 + (i % 5));
      const affixes = RARITIES[item.rarity].affixes + (item.slot === 'relic' ? 1 : 0);
      const implicit = item.slot === 'weapon' ? 1 : item.slot === 'armor' ? 2 : 0;
      // Affixes never repeat a stat... except merging into an implicit stat.
      expect(item.stats.length).toBeLessThanOrEqual(implicit + affixes);
      expect(item.stats.length).toBeGreaterThanOrEqual(Math.max(implicit, affixes));
      expect(new Set(item.stats.map((s) => s.stat)).size).toBe(item.stats.length);
    }
  });

  it('better floors and minimum rarity shift the odds', () => {
    const count = (level: number) => {
      const rng = new Rng(3);
      let good = 0;
      for (let i = 0; i < 4000; i++) if (rollRarity(rng, level) !== 'common') good++;
      return good;
    };
    expect(count(5)).toBeGreaterThan(count(1));
    const rng = new Rng(4);
    for (let i = 0; i < 200; i++) {
      expect(RARITY_ORDER.indexOf(rollRarity(rng, 1, 'epic'))).toBeGreaterThanOrEqual(2);
    }
  });

  it('item value grows with rarity and level', () => {
    const item: Item = { slot: 'weapon', name: 'x', rarity: 'rare', level: 1, stats: [] };
    expect(itemValue({ ...item, rarity: 'epic' })).toBeGreaterThan(itemValue(item));
    expect(itemValue({ ...item, level: 5 })).toBeGreaterThan(itemValue(item));
  });
});

describe('drops & pickups', () => {
  it('kills drop gold that flies to the player', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 50, SPAWN.y, { alert: false });
    hit(game, e, 9999);
    expect(game.world.query('pickup').some(([, p]) => p.kind === 'gold')).toBe(true);
    run(game, 90);
    expect(party(game).gold).toBeGreaterThan(0);
  });

  it('consumables go to quick slots (stacking), F/G use them', () => {
    const game = sandbox();
    for (let i = 0; i < 2; i++)
      spawnPickup(game, SPAWN.x, SPAWN.y, { kind: 'consumable', id: 'potion', age: 30 }, false);
    run(game, 3);
    expect(party(game).quick[0]).toEqual({ id: 'potion', count: 2 });
    const h = game.world.req(game.player, 'health');
    h.hp = 10;
    run(game, 1, { useSlot: 0 });
    expect(h.hp).toBeCloseTo(10 + SHADOW_BLADE.maxHp * CONSUMABLES.potion.heal);
    expect(party(game).quick[0]!.count).toBe(1);
  });

  it('a full potion slot refuses to drink at full HP', () => {
    const game = sandbox();
    party(game).quick[0] = { id: 'potion', count: 1 };
    run(game, 1, { useSlot: 0 });
    expect(party(game).quick[0]).not.toBeNull();
  });

  it('thunder scroll stuns and hurts everything around', () => {
    const game = sandbox();
    party(game).quick[1] = { id: 'thunder', count: 1 };
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 150, SPAWN.y, { alert: false });
    run(game, 1, { useSlot: 1 });
    expect(hasStatus(game.world, e, 'stun')).toBe(true);
    expect(game.world.req(e, 'health').hp).toBe(ENEMIES.ghoul.maxHp - CONSUMABLES.thunder.damage);
    expect(party(game).quick[1]).toBeNull();
  });

  it('bombs explode after a fuse, hurting enemies (and the careless player)', () => {
    const game = sandbox();
    party(game).quick[0] = { id: 'bomb', count: 1 };
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 150, SPAWN.y, { alert: false });
    run(game, 1, { useSlot: 0, aimX: SPAWN.x + 150, aimY: SPAWN.y });
    expect(game.world.req(e, 'health').hp).toBe(ENEMIES.ghoul.maxHp);
    run(game, CONSUMABLES.bomb.fuseTicks + 2);
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
  });
});

describe('equipment (design 1b)', () => {
  it('standing on an item allows equipping it on any member; the old piece drops', () => {
    const game = sandbox();
    const first: Item = {
      slot: 'weapon',
      name: 'A',
      rarity: 'rare',
      level: 1,
      stats: [{ stat: 'damagePct', value: 0.1 }],
    };
    const second: Item = {
      slot: 'weapon',
      name: 'B',
      rarity: 'epic',
      level: 1,
      stats: [{ stat: 'damagePct', value: 0.3 }],
    };
    const e1 = spawnPickup(game, SPAWN.x, SPAWN.y, { kind: 'item', item: first, age: 0 }, false);
    run(game, 1, { ui: { kind: 'equip', item: e1, member: 1 } });
    expect(party(game).members[1]!.equipment.weapon).toBe(first);
    expect(party(game).members[1]!.mods.damagePct).toBeCloseTo(0.1);
    const e2 = spawnPickup(game, SPAWN.x, SPAWN.y, { kind: 'item', item: second, age: 0 }, false);
    run(game, 1, { ui: { kind: 'equip', item: e2, member: 1 } });
    expect(party(game).members[1]!.equipment.weapon).toBe(second);
    expect(game.world.query('pickup').some(([, p]) => p.kind === 'item' && p.item === first)).toBe(
      true,
    );
  });

  it('can’t equip from across the room; salvaging gives gold', () => {
    const game = sandbox();
    const item = generateItem(new Rng(2), 1);
    const far = spawnPickup(game, SPAWN.x + 200, SPAWN.y, { kind: 'item', item, age: 0 }, false);
    run(game, 1, { ui: { kind: 'equip', item: far, member: 0 } });
    expect(party(game).members[0]!.equipment[item.slot]).toBeNull();
    place(game, SPAWN.x + 200, SPAWN.y);
    run(game, 1, { ui: { kind: 'salvage', item: far } });
    expect(party(game).gold).toBe(itemValue(item));
    expect(game.world.isAlive(far)).toBe(false);
  });

  it('armour HP and damage reduction apply', () => {
    const game = sandbox();
    const armor: Item = {
      slot: 'armor',
      name: 'X',
      rarity: 'common',
      level: 1,
      stats: [
        { stat: 'maxHpPct', value: 0.25 },
        { stat: 'damageReduction', value: 0.5 },
      ],
    };
    const e = spawnPickup(game, SPAWN.x, SPAWN.y, { kind: 'item', item: armor, age: 0 }, false);
    run(game, 1, { ui: { kind: 'equip', item: e, member: 0 } });
    expect(game.world.req(game.player, 'health').max).toBe(Math.round(SHADOW_BLADE.maxHp * 1.25));
    const h = game.world.req(game.player, 'health');
    const before = h.hp;
    dealDamage(game, game.player, {
      amount: 20,
      source: null,
      byPlayer: false,
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
    expect(before - h.hp).toBe(10);
  });
});

describe('global relics & curses', () => {
  it('relics affect the whole party; curses hurt', () => {
    const game = sandbox();
    addRelic(game, 'frailty');
    for (const m of party(game).members)
      expect(m.mods.maxHpPct).toBeCloseTo(RELICS.frailty.mods.maxHpPct);
    addRelic(game, 'goldenTooth');
    expect(party(game).members[2]!.mods.goldPct).toBeCloseTo(0.5);
  });

  it('Sablier fêlé shortens switch cooldowns; Totem du relais empowers the newcomer', () => {
    const game = sandbox();
    addRelic(game, 'brokenHourglass');
    addRelic(game, 'relayTotem');
    run(game, 1, { switchTo: 1 });
    expect(party(game).switchCooldown).toBeLessThan(60);
    expect(hasStatus(game.world, game.player, 'empowered')).toBe(true);
  });

  it('Plume de phénix cancels the first KO of the floor', () => {
    const game = sandbox();
    addRelic(game, 'phoenixFeather');
    lethalOnPlayer(game);
    expect(party(game).members[0]!.ko).toBe(false);
    expect(game.world.req(game.player, 'player').classId).toBe('shadowBlade');
    game.world.req(game.player, 'health').invuln = 0;
    lethalOnPlayer(game);
    expect(party(game).members[0]!.ko).toBe(true);
  });

  it('Cape d’ombre: +30 % damage while invisible', () => {
    const game = sandbox();
    addRelic(game, 'shadowCloak');
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 100, SPAWN.y, { alert: false });
    game.world
      .req(game.player, 'statuses')
      .list.push({ id: 'invisible', ticks: 100, source: null, dotTimer: 0 });
    hit(game, e, 10);
    expect(ENEMIES.ghoul.maxHp - game.world.req(e, 'health').hp).toBe(13);
  });
});

describe('floor loot: chests, shop, altar', () => {
  const dungeon = () => new Game('LOOT', DT);
  const goTo = (game: Game, type: string, dy = 40) => {
    const room = game.dungeon!.floor.rooms.find((r) => r.type === type)!;
    const c = game.map.tileCenter(room.center.tx, room.center.ty);
    place(game, c.x + 16, c.y + 16 + dy);
    run(game, 2);
    return room;
  };

  it('each floor has locked treasure chests, a shop and an altar', () => {
    const game = dungeon();
    const kinds = game.world.query('interactable').map(([, it]) => it.kind);
    expect(kinds).toContain('chest');
    expect(kinds).toContain('altar');
    expect(kinds.filter((k) => k === 'shop')).toHaveLength(4);
  });

  it('a locked chest needs a key and spills loot', () => {
    const game = dungeon();
    party(game).keys = 0;
    goTo(game, 'treasure', 30);
    const fail = runCollect(game, 1, { interactPressed: true });
    expect(fail.some((e) => e.type === 'interactFail')).toBe(true);
    party(game).keys = 1;
    const ok = runCollect(game, 1, { interactPressed: true });
    expect(ok.some((e) => e.type === 'chestOpen')).toBe(true);
    expect(party(game).keys).toBe(0);
    expect(game.world.query('pickup').some(([, p]) => p.kind === 'item')).toBe(true);
  });

  it('the shop sells for gold', () => {
    const game = dungeon();
    goTo(game, 'shop', 30);
    const fail = runCollect(game, 1, { interactPressed: true });
    expect(fail.some((e) => e.type === 'interactFail')).toBe(true);
    party(game).gold = 10_000;
    const ok = runCollect(game, 1, { interactPressed: true });
    expect(ok.some((e) => e.type === 'purchase')).toBe(true);
    expect(party(game).gold).toBeLessThan(10_000);
  });

  it('altar sacrifice: max HP for a relic; pact: legendary + curse; single use', () => {
    const game = dungeon();
    goTo(game, 'altar');
    runCollect(game, 1, { interactPressed: true });
    run(game, 1, { ui: { kind: 'altar', option: 'sacrifice' } });
    expect(party(game).relics).toHaveLength(1);
    expect(party(game).members[0]!.health.max).toBe(
      Math.round(SHADOW_BLADE.maxHp * (1 - LOOT.altar.sacrificeMaxHpPct)),
    );
    run(game, 1, { ui: { kind: 'altar', option: 'pact' } });
    expect(party(game).relics).toHaveLength(1);
  });

  it('bombs break cracked walls', () => {
    let game = new Game('SECRET-0', DT);
    for (let i = 1; game.dungeon!.floor.secretRoom < 0; i++) game = new Game(`SECRET-${i}`, DT);
    const f = game.dungeon!.floor;
    const crack = f.cracked[0]!;
    const host = f.rooms[f.rooms[f.secretRoom]!.neighbors[0]!]!;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const [dx, dy] = dirs.find(
      ([x, y]) => f.roomAt[(crack.ty + y) * f.map.width + crack.tx + x] === host.id,
    )!;
    const stand = game.map.tileCenter(crack.tx + dx * 3, crack.ty + dy * 3);
    place(game, stand.x, stand.y);
    for (const [e] of game.world.query('enemy')) game.world.destroy(e);
    party(game).quick[0] = { id: 'bomb', count: 1 };
    const target = game.map.tileCenter(crack.tx + dx, crack.ty + dy);
    const events = runCollect(game, CONSUMABLES.bomb.fuseTicks + 5, {
      useSlot: 0,
      aimX: target.x,
      aimY: target.y,
    });
    expect(events.some((e) => e.type === 'secretFound')).toBe(true);
    expect(game.map.get(crack.tx, crack.ty)).toBe(Tile.Floor);
  });
});
