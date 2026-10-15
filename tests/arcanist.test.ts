import { describe, expect, it } from 'vitest';
import { ARCANIST } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { applyStatus, hasStatus } from '../src/systems/statuses';
import { DT, playerPos, run, runCollect, SPAWN } from './helpers';

function arcanist(): Game {
  return new Game('A', DT, {
    mode: 'arena',
    waves: false,
    party: ['arcanist', 'guardian', 'shadowBlade'],
  });
}

const passive = (game: Game, x: number, y = SPAWN.y): number => {
  const e = spawnEnemy(game, 'ghoul', x, y);
  game.world.req(e, 'enemy').cooldown = 9999;
  game.world.req(e, 'facing').angle = Math.PI;
  return e;
};

describe('Arcaniste', () => {
  it('fires arcane bolts while the button is held, every 3rd is empowered', () => {
    const game = arcanist();
    const events = runCollect(game, ARCANIST.bolt.cooldownTicks * 2 + 1, {
      attackHeld: true,
      aimX: SPAWN.x + 300,
      aimY: SPAWN.y,
    });
    const casts = events.filter((e) => e.type === 'cast');
    expect(casts.map((c) => (c.type === 'cast' ? c.spell : ''))).toEqual([
      'bolt',
      'bolt',
      'empowered',
    ]);
  });

  it('empowered bolts pierce through several enemies', () => {
    const game = arcanist();
    game.world.req(game.player, 'player').boltCount = ARCANIST.bolt.empowerEvery - 1;
    const a = passive(game, SPAWN.x + 80);
    const b = passive(game, SPAWN.x + 140);
    run(game, 1, { attackPressed: true, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    run(game, 30, { aimX: SPAWN.x + 300, aimY: SPAWN.y });
    for (const e of [a, b])
      expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
  });

  it('frost orb bursts at the cursor, slowing and damaging, for mana', () => {
    const game = arcanist();
    const e = passive(game, SPAWN.x + 200);
    run(game, 1, { rangedPressed: true, aimX: SPAWN.x + 200, aimY: SPAWN.y + 30 });
    expect(game.world.req(game.player, 'player').mana).toBeLessThan(ARCANIST.maxMana);
    const events = runCollect(game, 60);
    expect(events.some((ev) => ev.type === 'explosion')).toBe(true);
    expect(hasStatus(game.world, e, 'slow')).toBe(true);
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
  });

  it('no mana, no spell', () => {
    const game = arcanist();
    game.world.req(game.player, 'player').mana = 5;
    const events = runCollect(game, 1, { rangedPressed: true, aimX: SPAWN.x + 200, aimY: SPAWN.y });
    expect(events.some((e) => e.type === 'cast')).toBe(false);
    expect(game.world.query('projectile')).toHaveLength(0);
  });

  it('passive: slowed targets take extra damage', () => {
    const game = arcanist();
    const e = passive(game, SPAWN.x + 80);
    applyStatus(game, e, 'slow', 600);
    // Kill the crit randomness: compare against both outcomes.
    run(game, 1, { attackPressed: true, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    run(game, 20, { aimX: SPAWN.x + 300, aimY: SPAWN.y });
    const dmg = ENEMIES.ghoul.maxHp - game.world.req(e, 'health').hp;
    const base = ARCANIST.bolt.damage * ARCANIST.passive.slowedDamageMult;
    expect([Math.round(base), Math.round(base * ARCANIST.critMultiplier)]).toContain(dmg);
  });

  it('blink teleports, stops at walls and chills where it left', () => {
    const game = arcanist();
    const e = passive(game, SPAWN.x - 30);
    run(game, 1, { dashPressed: true, moveX: 1, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    expect(Math.abs(playerPos(game).x - (SPAWN.x + ARCANIST.blink.distance))).toBeLessThan(2);
    expect(hasStatus(game.world, e, 'slow')).toBe(true);
    // Towards the wall at x = 672: stopped flush, never inside.
    run(game, ARCANIST.dash.rechargeTicks + 1);
    run(game, 1, { dashPressed: true, moveX: 1 });
    expect(playerPos(game).x + ARCANIST.radius).toBeLessThanOrEqual(672);
  });

  it('brasier burns enemies standing in it', () => {
    const game = arcanist();
    const e = passive(game, SPAWN.x + 150);
    run(game, 1, { skillPressed: true, aimX: SPAWN.x + 150, aimY: SPAWN.y });
    expect(game.world.query('zone')).toHaveLength(1);
    run(game, 60);
    expect(hasStatus(game.world, e, 'burn')).toBe(true);
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
  });

  it('meteor shower: telegraphed impacts around the cursor', () => {
    const g2 = arcanist();
    g2.world.req(g2.player, 'player').energy = ARCANIST.ultimate.energyCost;
    const target = passive(g2, SPAWN.x + 160);
    g2.world.req(target, 'health').hp = 500;
    g2.world.req(target, 'health').max = 500;
    const all = runCollect(g2, 1, { ultimatePressed: true, aimX: SPAWN.x + 160, aimY: SPAWN.y });
    all.push(
      ...runCollect(
        g2,
        ARCANIST.ultimate.meteors * ARCANIST.ultimate.intervalTicks +
          ARCANIST.ultimate.fallTicks +
          5,
        { aimX: SPAWN.x + 160, aimY: SPAWN.y },
      ),
    );
    expect(all.filter((ev) => ev.type === 'cast' && ev.spell === 'meteor').length).toBeGreaterThan(
      0,
    );
    expect(all.filter((ev) => ev.type === 'explosion').length).toBeGreaterThan(0);
    // The first meteor lands exactly on the cursor.
    expect(g2.world.req(target, 'health').hp).toBeLessThanOrEqual(500 - ARCANIST.ultimate.damage);
  });
});
