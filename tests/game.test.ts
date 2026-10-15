import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Tile } from '../src/core/tilemap';
import { SHADOW_BLADE } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { Game } from '../src/game/game';
import { spawnEnemy } from '../src/game/factories';
import { emptyInput, type InputFrame } from '../src/game/inputFrame';
import { DT, playerPos, run, sandbox, settle } from './helpers';

describe('player movement', () => {
  it('accelerates quickly to its configured speed', () => {
    const game = sandbox();
    const start = playerPos(game);
    run(game, 60, { moveX: 1, aimX: 9999, aimY: start.y });
    const travelled = playerPos(game).x - start.x;
    expect(travelled).toBeGreaterThan(SHADOW_BLADE.mover.moveSpeed * 0.93);
    expect(travelled).toBeLessThanOrEqual(SHADOW_BLADE.mover.moveSpeed);
  });

  it('is stopped by walls', () => {
    const game = sandbox();
    run(game, 600, { moveX: 1 });
    const { x } = playerPos(game);
    // Wall column 21 starts at x = 672 in the test arena.
    expect(x + SHADOW_BLADE.radius).toBeLessThanOrEqual(672);
    expect(x + SHADOW_BLADE.radius).toBeGreaterThan(671);
  });
});

describe('dash', () => {
  it('spends a charge, covers distance fast, grants i-frames and recharges', () => {
    const game = sandbox();
    const start = playerPos(game);
    const aim = { aimX: start.x + 500, aimY: start.y };
    game.step({ ...emptyInput(), ...aim, dashPressed: true });
    const dash = game.world.req(game.player, 'dash');
    expect(dash.charges).toBe(SHADOW_BLADE.dash.maxCharges - 1);
    expect(game.world.req(game.player, 'health').invuln).toBeGreaterThan(0);
    run(game, SHADOW_BLADE.dash.durationTicks, aim);
    const travelled = playerPos(game).x - start.x;
    expect(travelled).toBeGreaterThan(
      SHADOW_BLADE.dash.speed * SHADOW_BLADE.dash.durationTicks * DT * 0.85,
    );
    run(game, SHADOW_BLADE.dash.rechargeTicks, aim);
    expect(dash.charges).toBe(SHADOW_BLADE.dash.maxCharges);
  });

  it('cannot dash without charges', () => {
    const game = sandbox();
    const dash = game.world.req(game.player, 'dash');
    dash.charges = 0;
    run(game, 1, { dashPressed: true });
    expect(dash.active).toBe(0);
  });
});

describe('melee combat', () => {
  function duel(enemyFacing: number): { game: Game; enemy: number } {
    const game = sandbox();
    const p = playerPos(game);
    const enemy = spawnEnemy(game, 'ghoul', p.x + 30, p.y);
    game.world.req(enemy, 'facing').angle = enemyFacing;
    game.world.req(enemy, 'enemy').cooldown = 9999; // keep it passive
    return { game, enemy };
  }

  it('a frontal hit deals base (or crit) damage', () => {
    const { game, enemy } = duel(Math.PI); // facing the player
    const p = playerPos(game);
    run(game, SHADOW_BLADE.combo[0]!.windupTicks + 1, {
      attackPressed: true,
      aimX: p.x + 100,
      aimY: p.y,
    });
    const hit = game.events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ type: 'hit', backstab: false, byPlayer: true });
    const dmg = SHADOW_BLADE.combo[0]!.damage;
    expect([dmg, Math.round(dmg * SHADOW_BLADE.critMultiplier)]).toContain(
      ENEMIES.ghoul.maxHp - game.world.req(enemy, 'health').hp,
    );
  });

  it('hitting from behind is a guaranteed backstab crit', () => {
    const { game, enemy } = duel(0); // facing away from the player
    const p = playerPos(game);
    run(game, SHADOW_BLADE.combo[0]!.windupTicks + 1, {
      attackPressed: true,
      aimX: p.x + 100,
      aimY: p.y,
    });
    expect(game.events.find((e) => e.type === 'hit')).toMatchObject({ backstab: true, crit: true });
    expect(ENEMIES.ghoul.maxHp - game.world.req(enemy, 'health').hp).toBe(
      Math.round(SHADOW_BLADE.combo[0]!.damage * SHADOW_BLADE.backstabMultiplier),
    );
  });

  it('holding attack chains the combo and a kill refunds dash + energy', () => {
    const { game, enemy } = duel(Math.PI);
    const dash = game.world.req(game.player, 'dash');
    dash.charges = 0;
    const p = playerPos(game);
    for (let i = 0; i < 180 && game.world.isAlive(enemy); i++) {
      // Keep aiming at the (knocked back) enemy.
      const et = game.world.get(enemy, 'transform');
      game.step({
        ...emptyInput(),
        aimX: et?.x ?? p.x + 100,
        aimY: et?.y ?? p.y,
        attackHeld: true,
        attackPressed: i === 0,
        rangedPressed: false,
        dashPressed: false,
      });
    }
    expect(game.world.isAlive(enemy)).toBe(false);
    expect(game.events.some((e) => e.type === 'kill')).toBe(true);
    expect(dash.charges).toBe(SHADOW_BLADE.dash.refundOnKill);
    const player = game.world.req(game.player, 'player');
    expect(player.kills).toBe(1);
    // Energy fills from the kill AND from all damage dealt (design 1c).
    expect(player.energy).toBeCloseTo(
      SHADOW_BLADE.energyOnKill + ENEMIES.ghoul.maxHp * SHADOW_BLADE.energyPerDamage,
    );
  });

  it('a dash cancels the current swing', () => {
    const game = sandbox();
    run(game, 1, { attackPressed: true, aimX: 9999 });
    expect(game.world.req(game.player, 'combo').tick).toBeGreaterThanOrEqual(0);
    run(game, 1, { dashPressed: true, aimX: 9999 });
    expect(game.world.req(game.player, 'combo').tick).toBe(-1);
    expect(game.world.query('hitbox')).toHaveLength(0);
  });
});

describe('shuriken', () => {
  it('flies and is destroyed by walls', () => {
    const game = sandbox();
    const p = playerPos(game);
    run(game, 1, { rangedPressed: true, aimX: p.x, aimY: p.y - 1000 });
    expect(game.world.query('projectile')).toHaveLength(1);
    run(game, 60, { aimX: p.x, aimY: p.y - 1000 });
    expect(game.world.query('projectile')).toHaveLength(0);
  });

  it('respects its cooldown', () => {
    const game = sandbox();
    run(game, 1, { rangedPressed: true, aimX: 9999 });
    run(game, 1, { rangedPressed: true, aimX: 9999 });
    expect(game.world.query('projectile')).toHaveLength(1);
  });
});

describe('ghoul AI', () => {
  it('telegraphs, then strikes a player that stands still', () => {
    const game = sandbox();
    const p = playerPos(game);
    const enemy = spawnEnemy(game, 'ghoul', p.x + 34, p.y);
    game.world.req(enemy, 'enemy').cooldown = 0;
    run(game, 2);
    expect(game.world.req(enemy, 'enemy').phase).toBe('windup');
    const hp = game.world.req(game.player, 'health');
    run(game, ENEMIES.ghoul.windupTicks - 3);
    expect(hp.hp).toBe(SHADOW_BLADE.maxHp); // not hit during the telegraph
    run(game, 10);
    expect(hp.hp).toBe(SHADOW_BLADE.maxHp - ENEMIES.ghoul.strike.damage);
    expect(hp.invuln).toBeGreaterThan(0);
  });

  it('a staggering hit interrupts its wind-up', () => {
    const game = sandbox();
    const p = playerPos(game);
    const enemy = spawnEnemy(game, 'ghoul', p.x + 34, p.y);
    const ai = game.world.req(enemy, 'enemy');
    ai.cooldown = 0;
    run(game, 2);
    expect(ai.phase).toBe('windup');
    game.world.req(enemy, 'health').stagger = 10;
    run(game, 1);
    expect(ai.phase).toBe('recover');
  });
});

describe('determinism', () => {
  function scripted(seed: string): string {
    const game = new Game(seed, DT);
    const script = new Rng(99);
    for (let i = 0; i < 1200; i++) {
      const input: InputFrame = {
        moveX: script.int(-1, 1),
        moveY: script.int(-1, 1),
        aimX: script.range(0, 960),
        aimY: script.range(0, 600),
        attackHeld: script.chance(0.3),
        attackPressed: script.chance(0.1),
        rangedPressed: script.chance(0.05),
        dashPressed: script.chance(0.03),
        skillPressed: script.chance(0.01),
        ultimatePressed: script.chance(0.01),
      };
      game.step(input);
      game.drainEvents();
    }
    settle(game);
    return JSON.stringify(
      game.world
        .query('transform', 'health')
        .map(([e, t, h]) => [e, t.x.toFixed(4), t.y.toFixed(4), h.hp]),
    );
  }

  it('same seed + same inputs → identical simulation', () => {
    expect(scripted('DAILY')).toBe(scripted('DAILY'));
  });

  it('different seeds diverge', () => {
    expect(scripted('DAILY')).not.toBe(scripted('OTHER'));
  });
});

describe('walls block melee', () => {
  // Pillar column x=6 (192..224 px) spans rows 8-10; the player stands just left of it.
  function attackAcrossPillar(removePillar: boolean): number {
    const game = sandbox();
    if (removePillar) for (let ty = 8; ty <= 10; ty++) game.map.set(6, ty, Tile.Floor);
    const t = game.world.req(game.player, 'transform');
    t.x = t.prevX = 180;
    t.y = t.prevY = 304;
    const enemy = spawnEnemy(game, 'ghoul', 237, 304);
    game.world.req(enemy, 'enemy').cooldown = 9999;
    run(game, 6, { attackPressed: true, aimX: 400, aimY: 304 });
    return game.world.req(enemy, 'health').hp;
  }

  it('cannot hit an enemy behind a pillar (but can without it)', () => {
    expect(attackAcrossPillar(false)).toBe(ENEMIES.ghoul.maxHp);
    expect(attackAcrossPillar(true)).toBeLessThan(ENEMIES.ghoul.maxHp);
  });
});
