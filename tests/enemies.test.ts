import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { TEST_ARENA } from '../src/data/arenas';
import { SHADOW_BLADE } from '../src/data/classes';
import { ELITE, ELITE_MODIFIERS } from '../src/data/elites';
import { ENEMIES, isEnemyId } from '../src/data/enemies';
import { spawnEnemy, spawnExplosion } from '../src/game/factories';
import { applyStatus, hasStatus } from '../src/systems/statuses';
import { rollWave } from '../src/systems/waves';
import { DT, place, run, runCollect, sandbox, SPAWN } from './helpers';

const playerHp = (game: Game): number => game.world.req(game.player, 'health').hp;

describe('enemy data', () => {
  it('references valid enemy ids and sane ranges', () => {
    for (const def of Object.values(ENEMIES)) {
      if (def.behavior === 'summoner') expect(isEnemyId(def.summonId)).toBe(true);
      if ('preferredRange' in def)
        expect(def.preferredRange[0]).toBeLessThan(def.preferredRange[1]);
    }
    for (const p of TEST_ARENA.waves.pool) expect(isEnemyId(p.id)).toBe(true);
  });
});

describe("Archer d'ossuaire", () => {
  it('telegraphs, then fires a slowing bolt', () => {
    const game = sandbox();
    const archer = spawnEnemy(game, 'boneArcher', SPAWN.x + 200, SPAWN.y);
    game.world.req(archer, 'enemy').cooldown = 0;
    const events = runCollect(game, ENEMIES.boneArcher.windupTicks + 2);
    expect(events.some((e) => e.type === 'windup')).toBe(true);
    expect(events.some((e) => e.type === 'enemyShoot')).toBe(true);
    let hitAt = -1;
    for (let i = 0; i < 60 && hitAt < 0; i++) {
      run(game, 1);
      if (playerHp(game) < SHADOW_BLADE.maxHp) hitAt = i;
    }
    expect(hitAt).toBeGreaterThanOrEqual(0);
    expect(playerHp(game)).toBe(SHADOW_BLADE.maxHp - ENEMIES.boneArcher.projectile.damage);
    expect(hasStatus(game.world, game.player, 'slow')).toBe(true);
  });

  it('backs off when the player is too close', () => {
    const game = sandbox();
    const archer = spawnEnemy(game, 'boneArcher', SPAWN.x + 60, SPAWN.y);
    game.world.req(archer, 'enemy').cooldown = 9999;
    run(game, 40);
    const t = game.world.req(archer, 'transform');
    expect(Math.hypot(t.x - SPAWN.x, t.y - SPAWN.y)).toBeGreaterThan(100);
  });
});

describe('Boursouflé', () => {
  it('rushes in, lights its fuse and explodes (poisoning the player)', () => {
    const game = sandbox();
    const bloater = spawnEnemy(game, 'bloater', SPAWN.x + 160, SPAWN.y);
    const events = runCollect(game, 160);
    expect(events.some((e) => e.type === 'explosion')).toBe(true);
    expect(game.world.isAlive(bloater)).toBe(false);
    expect(playerHp(game)).toBeLessThan(SHADOW_BLADE.maxHp - ENEMIES.bloater.explosion.damage + 1);
  });

  it('explosions are neutral: they also hurt enemies', () => {
    const game = sandbox();
    const ghoul = spawnEnemy(game, 'ghoul', SPAWN.x + 40, SPAWN.y, { alert: false });
    spawnExplosion(game, ghoul, SPAWN.x + 20, SPAWN.y, {
      radius: 50,
      damage: 10,
      knockback: 0,
      delayTicks: 0,
      creditPlayer: false,
    });
    run(game, 1);
    expect(playerHp(game)).toBe(SHADOW_BLADE.maxHp - 10);
    expect(game.world.req(ghoul, 'health').hp).toBe(ENEMIES.ghoul.maxHp - 10);
  });

  it('killed by the player, it explodes after a delay and its victims count as player kills', () => {
    const game = sandbox();
    place(game, SPAWN.x - 150, SPAWN.y);
    const bloater = spawnEnemy(game, 'bloater', SPAWN.x + 100, SPAWN.y, { alert: false });
    const ghoul = spawnEnemy(game, 'ghoul', SPAWN.x + 130, SPAWN.y, { alert: false });
    game.world.req(ghoul, 'health').hp = 5;
    game.world.req(bloater, 'health').hp = 1;
    // Shuriken towards the bloater.
    run(game, 1, { rangedPressed: true, aimX: SPAWN.x + 100, aimY: SPAWN.y });
    run(game, 60, { aimX: SPAWN.x + 100, aimY: SPAWN.y });
    expect(game.world.isAlive(bloater)).toBe(false);
    expect(game.world.isAlive(ghoul)).toBe(false);
    expect(game.world.req(game.player, 'player').kills).toBe(2);
  });
});

describe('Cryptomancien', () => {
  it('channels and raises minions', () => {
    const game = sandbox();
    const c = spawnEnemy(game, 'cryptomancer', SPAWN.x + 220, SPAWN.y);
    game.world.req(c, 'enemy').cooldown = 0;
    const events = runCollect(game, ENEMIES.cryptomancer.channelTicks + 5);
    expect(events.filter((e) => e.type === 'summon')).toHaveLength(
      ENEMIES.cryptomancer.summonCount,
    );
    const minions = game.world.query('minion').filter(([, m]) => m.summoner === c);
    expect(minions).toHaveLength(ENEMIES.cryptomancer.summonCount);
  });

  it('respects its minion cap', () => {
    const game = sandbox();
    const c = spawnEnemy(game, 'cryptomancer', SPAWN.x + 220, SPAWN.y);
    for (let i = 0; i < ENEMIES.cryptomancer.maxMinions; i++) {
      spawnEnemy(game, 'larva', SPAWN.x + 200, SPAWN.y - 60 + i * 30, {
        summoner: c,
        alert: false,
      });
    }
    game.world.req(c, 'enemy').cooldown = 0;
    run(game, 10);
    expect(game.world.req(c, 'enemy').phase).not.toBe('channel');
  });

  it('a stagger interrupts the channel', () => {
    const game = sandbox();
    const c = spawnEnemy(game, 'cryptomancer', SPAWN.x + 220, SPAWN.y);
    game.world.req(c, 'enemy').cooldown = 0;
    run(game, 5);
    expect(game.world.req(c, 'enemy').phase).toBe('channel');
    game.world.req(c, 'health').stagger = 5;
    const events = runCollect(game, ENEMIES.cryptomancer.channelTicks);
    expect(events.some((e) => e.type === 'summon')).toBe(false);
  });
});

describe('elites', () => {
  it('armored elites get the elite and modifier HP multipliers', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 200, SPAWN.y, { elite: ['armored'] });
    expect(game.world.req(e, 'health').max).toBe(
      Math.round(ENEMIES.ghoul.maxHp * ELITE.hpMult * ELITE_MODIFIERS.armored.hpMult),
    );
  });

  it('enraged elites hit harder', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 34, SPAWN.y, { elite: ['enraged'] });
    game.world.req(e, 'enemy').cooldown = 0;
    run(game, ENEMIES.ghoul.windupTicks + 10);
    expect(SHADOW_BLADE.maxHp - playerHp(game)).toBe(
      Math.round(ENEMIES.ghoul.strike.damage * ELITE_MODIFIERS.enraged.damageMult),
    );
  });

  it('vampiric elites heal when they hit', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 34, SPAWN.y, { elite: ['vampiric'] });
    game.world.req(e, 'enemy').cooldown = 0;
    const h = game.world.req(e, 'health');
    h.hp = 50;
    run(game, ENEMIES.ghoul.windupTicks + 10);
    expect(h.hp).toBe(50 + ENEMIES.ghoul.strike.damage * ELITE_MODIFIERS.vampiric.lifesteal);
  });

  it('volatile elites explode on death', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 200, SPAWN.y, {
      elite: ['volatile'],
      alert: false,
    });
    game.world.req(e, 'health').hp = 1;
    applyStatus(game, e, 'poison', 60);
    const events = runCollect(game, 60);
    expect(events.some((ev) => ev.type === 'explosion')).toBe(true);
  });
});

describe('search with A*', () => {
  it('an enemy that lost the player walks to the last known position around walls, then gives up', () => {
    const game = sandbox();
    // Ghoul above the wall on row 6; the player was last seen below it.
    const e = spawnEnemy(game, 'ghoul', SPAWN.x, 150);
    const ai = game.world.req(e, 'enemy');
    place(game, 100, 500);
    applyStatus(game, game.player, 'invisible', 10_000);
    let maxPath = 0;
    for (let i = 0; i < 400 && ai.alert; i++) {
      run(game, 1);
      maxPath = Math.max(maxPath, ai.path.length);
    }
    expect(maxPath).toBeGreaterThan(0);
    expect(ai.alert).toBe(false);
    const t = game.world.req(e, 'transform');
    expect(Math.hypot(t.x - SPAWN.x, t.y - SPAWN.y)).toBeLessThan(24);
  });
});

describe('waves', () => {
  it('compositions are seeded and unlock enemy types by wave', () => {
    const roll = (seed: string, wave: number) =>
      rollWave(new Game(seed, DT, { waves: false }), wave);
    expect(roll('W', 5)).toEqual(roll('W', 5));
    expect(roll('W', 1).every((c) => c.id === 'ghoul' && c.elite.length === 0)).toBe(true);
  });
});
