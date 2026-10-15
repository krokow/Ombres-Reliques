import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { BIOMES, biomeForFloor, floorInBiome, loopOf, RUN_FLOORS } from '../src/data/biomes';
import { SHADOW_BLADE } from '../src/data/classes';
import { difficultyFor } from '../src/data/dungeon';
import { ENEMIES, enemyDef, isEnemyId, type BossEnemyDef, type EnemyId } from '../src/data/enemies';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { phaseFor } from '../src/systems/ai/boss';
import { dealDamage } from '../src/systems/damage';
import { rollEncounter } from '../src/systems/dungeon';
import { applyStatus, hasStatus } from '../src/systems/statuses';
import { DT, place, run, runCollect, sandbox, SPAWN } from './helpers';

const hpOf = (g: Game) => g.world.req(g.player, 'health').hp;

const hurt = (g: Game, e: number, amount: number) =>
  dealDamage(g, e, {
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

describe('run structure (choice 1b)', () => {
  it('3 floors per biome, 9 floors, then endless loops', () => {
    expect(RUN_FLOORS).toBe(9);
    expect([1, 3, 4, 6, 7, 9, 10].map(biomeForFloor)).toEqual([
      'crypt',
      'crypt',
      'forest',
      'forest',
      'forge',
      'forge',
      'crypt',
    ]);
    expect([1, 2, 3, 4].map(floorInBiome)).toEqual([1, 2, 3, 1]);
    expect([1, 9, 10, 18, 19].map(loopOf)).toEqual([0, 0, 1, 1, 2]);
    expect(difficultyFor(10).hpMult).toBeGreaterThan(difficultyFor(9).hpMult * 1.3);
  });

  it('every biome has 5-6 regular enemy types plus a true mini-boss and boss', () => {
    for (const biome of Object.values(BIOMES)) {
      expect(biome.roster.length).toBeGreaterThanOrEqual(5);
      expect(biome.roster.length).toBeLessThanOrEqual(6);
      for (const r of biome.roster) expect(isEnemyId(r.id)).toBe(true);
      expect(enemyDef(biome.miniboss).behavior).toBe('boss');
      expect(enemyDef(biome.boss).behavior).toBe('boss');
    }
    // Summons referenced anywhere exist.
    for (const def of Object.values(ENEMIES)) {
      if (def.behavior === 'summoner') expect(isEnemyId(def.summonId)).toBe(true);
      if (def.behavior === 'boss') {
        for (const ph of def.phases)
          for (const p of ph.patterns) if (p.kind === 'summon') expect(isEnemyId(p.id)).toBe(true);
      }
    }
  });

  it('floors 1-2 guard boss rooms with champion packs; floor 3 brings the true bosses', () => {
    for (const level of [1, 2, 3, 4, 6]) {
      const game = new Game('ENC', DT, { startLevel: level });
      const f = game.dungeon!.floor;
      const biome = BIOMES[f.biome];
      const rng = new Rng(1);
      const mini = rollEncounter(rng, f, f.rooms[f.minibossRoom]!);
      const boss = rollEncounter(rng, f, f.rooms[f.bossRoom]!);
      if (floorInBiome(level) === 3) {
        expect(mini.map((s) => s.id)).toEqual([biome.miniboss]);
        expect(boss.map((s) => s.id)).toEqual([biome.boss]);
      } else {
        expect(mini[0]!.elite.length).toBe(2);
        expect(mini[0]!.champion).toBe(biome.champions.miniboss);
        expect(boss.length).toBeGreaterThan(mini.length);
      }
      const roster = new Set<EnemyId>(biome.roster.map((r) => r.id));
      const combat = f.rooms.find((r) => r.type === 'combat')!;
      for (const s of rollEncounter(rng, f, combat)) expect(roster.has(s.id)).toBe(true);
    }
  });
});

describe('new behaviours', () => {
  it('chargers telegraph a lane then charge through the player', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'tombKnight', SPAWN.x + 160, SPAWN.y);
    game.world.req(e, 'enemy').cooldown = 0;
    const events = runCollect(game, 2);
    expect(events.some((ev) => ev.type === 'windup')).toBe(true);
    run(game, ENEMIES.tombKnight.windupTicks + 20);
    expect(hpOf(game)).toBeLessThan(SHADOW_BLADE.maxHp);
  });

  it('a charger that hits a wall is stunned', () => {
    const game = sandbox();
    // Wall column x=6 (192..224) next to the spawn row; knight charges left into it.
    place(game, 260, 304);
    const e = spawnEnemy(game, 'tombKnight', 460, 304);
    game.world.req(e, 'enemy').cooldown = 0;
    run(game, ENEMIES.tombKnight.windupTicks + 2);
    place(game, 460, 200); // dodge out of the lane
    run(game, ENEMIES.tombKnight.charge.durationTicks);
    expect(hasStatus(game.world, e, 'stun')).toBe(true);
  });

  it('artillery lobs delayed shells at the player position', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'emberMortar', SPAWN.x + 260, SPAWN.y);
    game.world.req(e, 'enemy').cooldown = 0;
    run(game, ENEMIES.emberMortar.windupTicks + 3);
    const shells = game.world
      .query('hitbox')
      .filter(([, hb]) => hb.team === 'enemy' && hb.delay > 0);
    expect(shells.length).toBeGreaterThan(0);
    run(game, ENEMIES.emberMortar.shell.delayTicks + 20);
    expect(hpOf(game)).toBeLessThan(SHADOW_BLADE.maxHp);
  });

  it('volley ranged enemies fire a fan', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'thornShooter', SPAWN.x + 200, SPAWN.y);
    game.world.req(e, 'enemy').cooldown = 0;
    run(game, ENEMIES.thornShooter.windupTicks + 2);
    expect(game.world.query('projectile').length).toBe(ENEMIES.thornShooter.volley.count);
  });
});

describe('bosses', () => {
  const boss = (id: EnemyId = 'cryptarch') => {
    const game = sandbox();
    game.godMode = true;
    const e = spawnEnemy(game, id, SPAWN.x + 200, SPAWN.y);
    return { game, e, def: enemyDef(id) as BossEnemyDef };
  };

  it('phase follows HP thresholds', () => {
    const def = ENEMIES.cryptarch as BossEnemyDef;
    expect(phaseFor(def, 1)).toBe(0);
    expect(phaseFor(def, 0.6)).toBe(1);
    expect(phaseFor(def, 0.2)).toBe(2);
  });

  it('crossing a threshold triggers an invulnerable roar and the next phase', () => {
    const { game, e, def } = boss();
    const h = game.world.req(e, 'health');
    hurt(game, e, h.max * 0.4);
    const events = runCollect(game, 6); // past the hit-stop
    expect(events).toContainEqual(expect.objectContaining({ type: 'bossPhase', phase: 1 }));
    expect(game.world.req(e, 'boss').step as string).toBe('transition');
    expect(h.invuln).toBeGreaterThan(def.phaseTransitionTicks - 5);
  });

  it('bosses ignore staggers and shrug off most of a stun', () => {
    const { game, e, def } = boss();
    game.world.req(e, 'health').stagger = 50;
    applyStatus(game, e, 'stun', 100);
    const st = game.world.req(e, 'statuses').list.find((s) => s.id === 'stun')!;
    expect(st.ticks).toBe(Math.round(100 * def.stunResist));
    run(game, 1);
    expect(game.world.req(e, 'health').stagger).toBe(0);
  });

  it('rotates through its telegraphed patterns and actually attacks', () => {
    const { game, e } = boss('cryptarch');
    const events = runCollect(game, 600);
    expect(events.filter((ev) => ev.type === 'windup' && ev.entity === e).length).toBeGreaterThan(
      3,
    );
    expect(events.some((ev) => ev.type === 'enemyShoot')).toBe(true);
    expect(events.some((ev) => ev.type === 'summon')).toBe(true);
  });

  it('every pattern kind executes', () => {
    // Force each pattern of every boss once and check its signature effect.
    for (const id of [
      'ossuaryWarden',
      'cryptarch',
      'thornMother',
      'paleStag',
      'fallenSmith',
      'forgeHeart',
    ] as EnemyId[]) {
      const def = enemyDef(id) as BossEnemyDef;
      def.phases.forEach((phase, pi) => {
        phase.patterns.forEach((pattern, idx) => {
          const game = sandbox();
          game.godMode = true;
          const e = spawnEnemy(game, id, SPAWN.x + 150, SPAWN.y);
          const st = game.world.req(e, 'boss');
          st.phase = pi;
          const h = game.world.req(e, 'health');
          h.hp = h.max * phase.hpBelow;
          st.step = 'windup';
          st.current = idx;
          st.ticks = 0;
          st.aimX = SPAWN.x;
          st.aimY = SPAWN.y;
          const events = runCollect(game, pattern.windupTicks + 3);
          const w = game.world;
          const sig =
            pattern.kind === 'volley' || pattern.kind === 'nova'
              ? w.query('projectile').length >= pattern.count - 1
              : pattern.kind === 'summon'
                ? events.some((ev) => ev.type === 'summon') || w.query('minion').length > 0
                : pattern.kind === 'rain'
                  ? w.query('hitbox').some(([, hb]) => hb.delay > 0)
                  : pattern.kind === 'charge'
                    ? (st.step as string) === 'active' ||
                      w.query('hitbox').some(([, hb]) => hb.owner === e)
                    : events.some(
                        (ev) => ev.type === 'hit' || ev.type === 'shockwave' || ev.type === 'swing',
                      );
          expect(sig, `${id} phase ${pi} ${pattern.kind}`).toBe(true);
        });
      });
    }
  });
});

describe('victory & endless (choice 2b)', () => {
  it('beating the floor-9 boss wins; the stairs continue into endless mode', () => {
    const game = new Game('WIN', DT, { startLevel: RUN_FLOORS });
    const room = game.dungeon!.floor.rooms.find((r) => r.type === 'boss')!;
    const c = game.map.tileCenter(room.center.tx, room.center.ty);
    place(game, c.x + 40, c.y + 40);
    run(game, 3);
    for (const [e, enc] of game.world.query('encounter'))
      if (enc.room === room.id) game.world.destroy(e);
    const events = runCollect(game, 2);
    expect(events.some((e) => e.type === 'victory')).toBe(true);
    expect(game.dungeon!.victory).toBe(true);
    place(game, c.x, c.y);
    run(game, 1);
    expect(game.level).toBe(RUN_FLOORS + 1);
    expect(game.biome).toBe('crypt');
    expect(game.dungeon!.victory).toBe(false);
  });
});
