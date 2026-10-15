import { describe, expect, it } from 'vitest';
import { SHADOW_BLADE } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { STATUSES } from '../src/data/statuses';
import { spawnEnemy } from '../src/game/factories';
import { dealDamage } from '../src/systems/damage';
import { applyStatus, hasStatus } from '../src/systems/statuses';
import { playerPos, run, sandbox, SPAWN } from './helpers';

const hit = (amount: number) => ({
  amount,
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

describe('statuses', () => {
  it('re-applying refreshes to the longer duration without duplicating', () => {
    const game = sandbox();
    applyStatus(game, game.player, 'slow', 30);
    applyStatus(game, game.player, 'slow', 90);
    applyStatus(game, game.player, 'slow', 10);
    const list = game.world.req(game.player, 'statuses').list;
    expect(list).toHaveLength(1);
    expect(list[0]?.ticks).toBe(90);
    expect(game.events.filter((e) => e.type === 'status')).toHaveLength(1);
  });

  it('expires after its duration', () => {
    const game = sandbox();
    applyStatus(game, game.player, 'slow', 10);
    run(game, 10);
    expect(hasStatus(game.world, game.player, 'slow')).toBe(false);
  });

  it('slow reduces movement speed', () => {
    const game = sandbox();
    applyStatus(game, game.player, 'slow', 600);
    run(game, 60, { moveX: 1, aimX: 9999, aimY: SPAWN.y });
    const travelled = playerPos(game).x - SPAWN.x;
    const expected = SHADOW_BLADE.mover.moveSpeed * STATUSES.slow.moveMult;
    expect(travelled).toBeGreaterThan(expected * 0.9);
    expect(travelled).toBeLessThanOrEqual(expected + 1);
  });

  it('poison deals damage over time', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 200, SPAWN.y, { alert: false });
    applyStatus(game, e, 'poison', 150);
    run(game, 160);
    const ticks = Math.floor(150 / STATUSES.poison.dot.intervalTicks);
    expect(game.world.req(e, 'health').hp).toBe(
      ENEMIES.ghoul.maxHp - ticks * STATUSES.poison.dot.damage,
    );
  });

  it('stun freezes enemy attacks', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 34, SPAWN.y);
    game.world.req(e, 'enemy').cooldown = 0;
    applyStatus(game, e, 'stun', 120);
    run(game, 100);
    expect(game.world.req(game.player, 'health').hp).toBe(SHADOW_BLADE.maxHp);
    expect(game.world.req(e, 'enemy').phase).not.toBe('windup');
  });

  it('mark increases damage taken', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 200, SPAWN.y, { alert: false });
    applyStatus(game, e, 'mark', 100);
    dealDamage(game, e, hit(10));
    expect(ENEMIES.ghoul.maxHp - game.world.req(e, 'health').hp).toBe(
      Math.round(10 * STATUSES.mark.damageTakenMult),
    );
  });
});
