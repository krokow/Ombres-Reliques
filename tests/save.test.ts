import { describe, expect, it } from 'vitest';
import { RUN_FLOORS } from '../src/data/biomes';
import { UNLOCKS } from '../src/data/meta';
import { CLASS_IDS } from '../src/data/classes';
import { Game } from '../src/game/game';
import { emptyStats } from '../src/game/runStats';
import { SNAPSHOT_FORMAT } from '../src/game/snapshot';
import {
  buy,
  dailyChallenge,
  newMeta,
  priceOf,
  recordRun,
  relicPool,
  rewardFor,
  runBonuses,
  unlockedClasses,
  type RunRecord,
} from '../src/save/meta';
import { memoryStore, migrate, SAVE_KEY, SAVE_VERSION, SaveManager } from '../src/save/save';
import { addXp, recomputeAll } from '../src/systems/progression';
import { DT, run } from './helpers';

describe('Méta', () => {
  it('all five classes are playable from the start', () => {
    expect(unlockedClasses(newMeta())).toEqual(CLASS_IDS);
    expect(priceOf(newMeta(), { kind: 'unlock', id: 'class:summoner' })).toBeNull();
  });

  it('relic packs gate relics and must be bought in order', () => {
    const meta = newMeta();
    meta.shards = 500;
    expect(relicPool(meta)).not.toContain('phoenixFeather');
    expect(priceOf(meta, { kind: 'unlock', id: 'relics:2' })).toBeNull();
    buy(meta, { kind: 'unlock', id: 'relics:1' });
    expect(relicPool(meta)).toContain('phoenixFeather');
    expect(priceOf(meta, { kind: 'unlock', id: 'relics:2' })).not.toBeNull();
  });

  it('upgrades stack per rank up to their cap', () => {
    const meta = newMeta();
    meta.shards = 1000;
    for (let i = 0; i < 5; i++) buy(meta, { kind: 'upgrade', id: 'vitality' });
    expect(meta.upgrades.vitality).toBe(3);
    expect(runBonuses(meta).maxHpPct).toBeCloseTo(0.15);
  });

  it('rewards follow depth, bosses and victory; daily pays once', () => {
    const shallow = { ...emptyStats(), deepestFloor: 2, kills: 10 };
    const deep = {
      ...emptyStats(),
      deepestFloor: RUN_FLOORS,
      bosses: 3,
      minibosses: 3,
      victory: true,
      kills: 200,
    };
    expect(rewardFor(deep, { dailyBonus: false })).toBeGreaterThan(
      rewardFor(shallow, { dailyBonus: false }) * 10,
    );
    const meta = newMeta();
    const history: RunRecord[] = [];
    const end = {
      seed: 'X',
      daily: true,
      date: '2026-10-16',
      team: ['shadowBlade', 'guardian', 'arcanist'] as const,
      stats: deep,
      outcome: 'victory' as const,
    };
    const first = recordRun(meta, history, { ...end, team: [...end.team] });
    const second = recordRun(meta, history, { ...end, team: [...end.team] });
    expect(first.shards).toBe(Math.round(rewardFor(deep, { dailyBonus: false }) * 1.5));
    expect(second.shards).toBe(0);
    expect(history).toHaveLength(2);
    expect(meta.victories).toBe(2);
  });

  it('daily challenge: same seed and team for a date, different the next day', () => {
    const a = dailyChallenge('2026-10-16');
    expect(dailyChallenge('2026-10-16')).toEqual(a);
    expect(new Set(a.team).size).toBe(3);
    expect(dailyChallenge('2026-10-17').seed).not.toBe(a.seed);
  });
});

describe('Sauvegarde', () => {
  it('round-trips through the store', () => {
    const store = memoryStore();
    const s = new SaveManager(store);
    s.data.meta.shards = 42;
    s.data.settings.muted = true;
    s.write();
    const again = new SaveManager(store);
    expect(again.data.meta.shards).toBe(42);
    expect(again.data.settings.muted).toBe(true);
    expect(again.notice).toBeNull();
  });

  it('migrates a v1 save (meta only) to the current version', () => {
    const { save, migratedFrom } = migrate({
      version: 1,
      shards: 30,
      unlocked: ['class:berserker', 'not-a-real-unlock'],
      upgrades: { purse: 2, nope: 4 },
    });
    expect(migratedFrom).toBe(1);
    expect(save.version).toBe(SAVE_VERSION);
    // v1 → v2 → v3: the berserker unlock is refunded on the way.
    expect(save.meta.shards).toBe(70);
    expect(save.meta.unlocked).toEqual([]);
    expect(save.meta.upgrades).toEqual({ purse: 2 });
    expect(save.run).toBeNull();
  });

  it('v2 → v3 refunds the released class unlocks and keeps the rest', () => {
    const { save, migratedFrom } = migrate({
      version: 2,
      meta: { shards: 5, unlocked: ['class:summoner', 'class:berserker', 'relics:1'] },
      run: null,
      history: [],
    });
    expect(migratedFrom).toBe(2);
    expect(save.meta.shards).toBe(85);
    expect(save.meta.unlocked).toEqual(['relics:1']);
  });

  it('keeps a corrupt save aside and starts fresh', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, '{not json');
    const s = new SaveManager(store);
    expect(s.notice).toMatch(/illisible/);
    expect(store.getItem(`${SAVE_KEY}.corrupt`)).toBe('{not json');
    expect(s.data.meta.shards).toBe(0);
  });

  it('rejects saves from a future version instead of misreading them', () => {
    expect(migrate({ version: SAVE_VERSION + 1, meta: { shards: 999 } }).save.meta.shards).toBe(0);
  });

  it('drops a malformed run but keeps the meta', () => {
    const { save } = migrate({
      version: SAVE_VERSION,
      meta: { shards: 5 },
      run: { format: SNAPSHOT_FORMAT, seed: 'A', level: 2, members: [{ classId: 'dragon' }] },
    });
    expect(save.run).toBeNull();
    expect(save.meta.shards).toBe(5);
  });

  it('every unlock id is unique', () => {
    expect(new Set(UNLOCKS.map((u) => u.id)).size).toBe(UNLOCKS.length);
  });
});

describe('Reprise de run (2b)', () => {
  const advance = (g: Game): void => {
    // Some progress worth saving: XP, gold, a relic, a KO'd member.
    const party = g.world.req(g.player, 'party');
    addXp(g, party.members[0]!, 300);
    party.gold = 77;
    party.relics.push('bloodstone');
    recomputeAll(g);
    party.members[2]!.ko = true;
    party.members[2]!.health.hp = 0;
    g.descend();
  };

  it('a snapshot is taken at the start of each floor and survives JSON', () => {
    const g = new Game('RESUME', DT);
    expect(g.floorSnapshot?.level).toBe(1);
    advance(g);
    const snap = g.floorSnapshot;
    expect(snap?.level).toBe(2);
    expect(snap?.gold).toBe(77);
    const parsed = migrate({
      version: SAVE_VERSION,
      meta: {},
      run: JSON.parse(JSON.stringify(snap)),
    });
    expect(parsed.save.run).toEqual(snap);
  });

  it('resuming rebuilds exactly the same floor and the same game afterwards', () => {
    const original = new Game('RESUME', DT, { party: ['berserker', 'summoner', 'guardian'] });
    advance(original);
    const snap = JSON.parse(JSON.stringify(original.floorSnapshot));
    const resumed = new Game(snap.seed, DT, { restore: snap });

    const state = (g: Game): unknown => ({
      level: g.level,
      party: JSON.parse(
        JSON.stringify(g.world.req(g.player, 'party'), (k, v) =>
          k === 'flags' ? [...(v as Set<string>)] : (v as unknown),
        ),
      ),
      pickups: g.world.query('pickup', 'transform').map(([, p, t]) => [p.kind, t.x, t.y]),
      props: g.world.query('interactable', 'transform').map(([, i, t]) => [i.kind, t.x, t.y]),
      player: g.world.req(g.player, 'transform'),
    });
    expect(state(resumed)).toEqual(state(original));

    // Same inputs from here on → same outcome (RNG streams restored too).
    const inputs = { moveX: 1, moveY: 0.3, attackHeld: true, aimX: 900, aimY: 500 };
    run(original, 400, inputs);
    run(resumed, 400, inputs);
    expect(state(resumed)).toEqual(state(original));
    expect(resumed.stats).toEqual(original.stats);
  });

  it('meta bonuses apply to a fresh run and travel with the snapshot', () => {
    const g = new Game('BONUS', DT, {
      bonuses: { maxHpPct: 0.1, startGold: 40, startPotions: 1, reviveBonus: 0 },
      relicPool: ['bloodstone'],
    });
    const party = g.world.req(g.player, 'party');
    expect(party.gold).toBe(40);
    expect(party.quick[0]).toEqual({ id: 'potion', count: 1 });
    expect(party.members[0]!.health.max).toBe(Math.round(80 * 1.1));
    const resumed = new Game('BONUS', DT, { restore: JSON.parse(JSON.stringify(g.floorSnapshot)) });
    expect(resumed.world.req(resumed.player, 'party').members[0]!.health.max).toBe(88);
    expect(resumed.world.req(resumed.player, 'party').relicPool).toEqual(['bloodstone']);
  });
});
