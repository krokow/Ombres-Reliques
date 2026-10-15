import { describe, expect, it } from 'vitest';
import { SHADOW_BLADE } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { spawnEnemy } from '../src/game/factories';
import { executionTargets } from '../src/systems/kits/shadowBlade';
import { applyStatus, hasStatus } from '../src/systems/statuses';
import { run, runCollect, sandbox, SPAWN } from './helpers';

const VEIL = SHADOW_BLADE.veil;
const ULT = SHADOW_BLADE.ultimate;

describe('Voile de fumée', () => {
  it('drops a smoke zone, makes the player invisible, goes on cooldown', () => {
    const game = sandbox();
    const events = runCollect(game, 2, { skillPressed: true, aimX: 9999 });
    expect(events.some((e) => e.type === 'veil')).toBe(true);
    expect(game.world.query('zone')).toHaveLength(1);
    expect(hasStatus(game.world, game.player, 'invisible')).toBe(true);
    expect(game.world.req(game.player, 'player').skillCooldown).toBeGreaterThan(
      VEIL.cooldownTicks - 3,
    );
    run(game, 1, { skillPressed: true });
    expect(game.world.query('zone')).toHaveLength(1);
  });

  it('leaving the veil grants Ambush: next hit is a guaranteed crit', () => {
    const game = sandbox();
    run(game, 1, { skillPressed: true, aimX: 9999, aimY: SPAWN.y });
    const events = runCollect(game, 40, { moveX: 1, aimX: 9999, aimY: SPAWN.y });
    expect(events.some((e) => e.type === 'ambush')).toBe(true);
    expect(hasStatus(game.world, game.player, 'ambush')).toBe(true);
    expect(hasStatus(game.world, game.player, 'invisible')).toBe(false);

    const pt = game.world.req(game.player, 'transform');
    const enemy = spawnEnemy(game, 'ghoul', pt.x + 30, pt.y);
    game.world.req(enemy, 'facing').angle = Math.PI; // facing the player: no backstab
    game.world.req(enemy, 'enemy').cooldown = 9999;
    const hitEvents = runCollect(game, 4, { attackPressed: true, aimX: pt.x + 100, aimY: pt.y });
    const hit = hitEvents.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ crit: true, backstab: false });
    expect(ENEMIES.ghoul.maxHp - game.world.req(enemy, 'health').hp).toBe(
      Math.round(SHADOW_BLADE.combo[0]!.damage * SHADOW_BLADE.critMultiplier),
    );
    expect(hasStatus(game.world, game.player, 'ambush')).toBe(false);
  });

  it('the veil expiring with the player inside also grants Ambush', () => {
    const game = sandbox();
    run(game, 1, { skillPressed: true });
    run(game, VEIL.durationTicks + 2);
    expect(game.world.query('zone')).toHaveLength(0);
    expect(hasStatus(game.world, game.player, 'ambush')).toBe(true);
  });

  it('enemies lose the player and strike blindly at random points inside the veil (design 2b)', () => {
    const game = sandbox();
    const enemy = spawnEnemy(game, 'ghoul', SPAWN.x + 60, SPAWN.y);
    const ai = game.world.req(enemy, 'enemy');
    ai.cooldown = 9999;
    run(game, 2, { skillPressed: true });
    ai.cooldown = 0;
    let sawBlind = false;
    for (let i = 0; i < 60 && !sawBlind; i++) {
      run(game, 1);
      sawBlind = ai.phase === 'windup' && ai.blind;
    }
    expect(sawBlind).toBe(true);
    const zt = game.world.query('zone', 'transform')[0]![2];
    expect(Math.hypot(ai.aimX - zt.x, ai.aimY - zt.y)).toBeLessThanOrEqual(VEIL.radius);
  });
});

describe('Exécution', () => {
  it('fails without energy, keeping state intact', () => {
    const game = sandbox();
    spawnEnemy(game, 'ghoul', SPAWN.x + 80, SPAWN.y);
    const events = runCollect(game, 1, { ultimatePressed: true });
    expect(events).toContainEqual(expect.objectContaining({ type: 'ultFail', reason: 'energy' }));
    expect(game.world.req(game.player, 'player').execution).toBeNull();
  });

  it('fails without target and does not spend energy', () => {
    const game = sandbox();
    const player = game.world.req(game.player, 'player');
    player.energy = ULT.energyCost;
    const events = runCollect(game, 1, { ultimatePressed: true });
    expect(events).toContainEqual(expect.objectContaining({ type: 'ultFail', reason: 'noTarget' }));
    expect(player.energy).toBe(ULT.energyCost);
  });

  it('chains teleport strikes, hitting harder on wounded targets', () => {
    const game = sandbox();
    const player = game.world.req(game.player, 'player');
    player.energy = ULT.energyCost;
    const healthy = spawnEnemy(game, 'ghoul', SPAWN.x + 90, SPAWN.y - 40);
    const wounded = spawnEnemy(game, 'ghoul', SPAWN.x + 150, SPAWN.y + 40);
    for (const e of [healthy, wounded]) game.world.req(e, 'enemy').cooldown = 9999;
    const wh = game.world.req(wounded, 'health');
    wh.hp = 30; // above one hop of damage, so we can measure it
    const before = wh.hp;
    const events = runCollect(game, 1, { ultimatePressed: true });
    expect(events.some((e) => e.type === 'ultStart')).toBe(true);
    // Spent, then partially refilled by the first hop's damage/kill (same tick).
    expect(player.energy).toBeLessThan(ULT.energyCost / 2);
    expect(game.world.req(game.player, 'health').invuln).toBeGreaterThan(0);
    const all = [...events, ...runCollect(game, 80)];
    expect(all.filter((e) => e.type === 'blink')).toHaveLength(2);
    expect(player.execution).toBeNull();

    // The wounded target is hit first (lowest HP ratio) with the low-HP bonus.
    const expectedWounded = Math.round(
      ULT.damage * (1 + ULT.lowHpBonus * (1 - before / ENEMIES.ghoul.maxHp)),
    );
    const expectedHealthy = Math.round(ULT.damage);
    expect(game.world.isAlive(wounded) ? before - wh.hp : before).toBe(
      Math.min(before, expectedWounded),
    );
    expect(ENEMIES.ghoul.maxHp - game.world.req(healthy, 'health').hp).toBe(expectedHealthy);
  });

  it('prioritises marked targets, then the most wounded', () => {
    const game = sandbox();
    const a = spawnEnemy(game, 'ghoul', SPAWN.x + 80, SPAWN.y);
    const b = spawnEnemy(game, 'ghoul', SPAWN.x + 120, SPAWN.y);
    const c = spawnEnemy(game, 'ghoul', SPAWN.x + 160, SPAWN.y);
    game.world.req(b, 'health').hp = 10;
    applyStatus(game, c, 'mark', 100);
    expect(executionTargets(game)).toEqual([c, b, a]);
  });

  it('ignores enemies out of range or behind walls', () => {
    const game = sandbox();
    spawnEnemy(game, 'ghoul', SPAWN.x, SPAWN.y - 160); // behind the wall on row 6
    spawnEnemy(game, 'ghoul', SPAWN.x - 400, SPAWN.y - 250); // out of range
    expect(executionTargets(game)).toEqual([]);
  });
});
