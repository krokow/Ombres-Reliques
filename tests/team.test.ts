import { describe, expect, it } from 'vitest';
import { ARCANIST, GUARDIAN, SHADOW_BLADE } from '../src/data/classes';
import { TEAM } from '../src/data/team';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { dealDamage } from '../src/systems/damage';
import { applyStatus, hasStatus } from '../src/systems/statuses';
import { DT, place, run, runCollect, sandbox, SPAWN } from './helpers';

const lethal = {
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
};

const active = (g: Game): string => g.world.req(g.player, 'player').classId;

describe('party & switching', () => {
  it('starts with the default party, the first member active', () => {
    const game = sandbox();
    const party = game.world.req(game.player, 'party');
    expect(party.members.map((m) => m.classId)).toEqual(TEAM.defaultParty);
    expect(active(game)).toBe('shadowBlade');
  });

  it('1/2/3 switch the controlled character (body, speed and kit follow)', () => {
    const game = sandbox();
    const events = runCollect(game, 1, { switchTo: 1 });
    expect(active(game)).toBe('guardian');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'switch', from: 'shadowBlade', to: 'guardian' }),
    );
    expect(game.world.req(game.player, 'body').radius).toBe(GUARDIAN.radius);
    expect(game.world.req(game.player, 'mover').moveSpeed).toBe(GUARDIAN.mover.moveSpeed);
    expect(game.world.req(game.player, 'renderable').kind).toBe('guardian');
    expect(game.world.req(game.player, 'health').max).toBe(GUARDIAN.maxHp);
  });

  it('design 2c: global cooldown, then re-entry lockout for the one who left', () => {
    const game = sandbox();
    run(game, 1, { switchTo: 1 }); // → guardian; blade locked out
    run(game, 1, { switchTo: 2 });
    expect(active(game)).toBe('guardian'); // global cooldown
    run(game, TEAM.switchCooldownTicks);
    run(game, 1, { switchTo: 0 });
    expect(active(game)).toBe('guardian'); // blade still locked out
    run(game, 1, { switchTo: 2 });
    expect(active(game)).toBe('arcanist'); // third member is fine
    run(game, TEAM.reentryLockoutTicks);
    run(game, 1, { switchTo: 0 });
    expect(active(game)).toBe('shadowBlade');
  });

  it('a press during the cooldown is buffered briefly', () => {
    const game = sandbox();
    run(game, 1, { switchTo: 1 });
    run(game, TEAM.switchCooldownTicks - 3);
    run(game, 1, { switchTo: 2 });
    run(game, 4);
    expect(active(game)).toBe('arcanist');
  });

  it('each character keeps its own HP and energy', () => {
    const game = sandbox();
    game.world.req(game.player, 'health').hp = 33;
    game.world.req(game.player, 'player').energy = 40;
    run(game, 2, { switchTo: 1 });
    expect(game.world.req(game.player, 'health').hp).toBe(GUARDIAN.maxHp);
    expect(game.world.req(game.player, 'player').energy).toBe(0);
    const blade = game.world.req(game.player, 'party').members[0]!;
    expect(blade.health.hp).toBeGreaterThan(33); // regenerating in reserve
    expect(blade.state.energy).toBe(40);
  });

  it('reserve characters regenerate slowly; the active one does not', () => {
    const game = sandbox();
    const party = game.world.req(game.player, 'party');
    party.members[1]!.health.hp = 50;
    game.world.req(game.player, 'health').hp = 50;
    run(game, 60);
    expect(party.members[1]!.health.hp).toBeCloseTo(
      50 + GUARDIAN.maxHp * TEAM.reserveRegenPerSecond,
      0,
    );
    expect(game.world.req(game.player, 'health').hp).toBe(50);
  });

  it('cooldowns keep running in reserve', () => {
    const game = sandbox();
    run(game, 1, { skillPressed: true }); // veil
    const blade = game.world.req(game.player, 'party').members[0]!;
    const cd = blade.state.skillCooldown;
    run(game, 1, { switchTo: 1 });
    run(game, 100);
    expect(blade.state.skillCooldown).toBe(cd - 101);
  });

  it('switching out cleanses statuses', () => {
    const game = sandbox();
    applyStatus(game, game.player, 'poison', 600);
    run(game, 1, { switchTo: 1 });
    expect(hasStatus(game.world, game.player, 'poison')).toBe(false);
    expect(game.world.req(game.player, 'party').members[0]!.statuses.list).toHaveLength(0);
  });
});

describe('entry effects', () => {
  it('Lame d’Ombre arrives invisible with Ambush', () => {
    const game = sandbox();
    run(game, 1, { switchTo: 1 });
    run(game, TEAM.switchCooldownTicks);
    run(game, 1, { switchTo: 2 });
    run(game, TEAM.reentryLockoutTicks);
    run(game, 1, { switchTo: 0 });
    expect(active(game)).toBe('shadowBlade');
    expect(hasStatus(game.world, game.player, 'invisible')).toBe(true);
    expect(hasStatus(game.world, game.player, 'ambush')).toBe(true);
  });

  it('Gardien lands with a shockwave and a shield', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 50, SPAWN.y);
    game.world.req(e, 'enemy').cooldown = 9999;
    const before = game.world.req(e, 'transform').x;
    run(game, 1, { switchTo: 1 });
    expect(game.world.req(e, 'health').hp).toBeLessThan(game.world.req(e, 'health').max);
    run(game, 10);
    expect(game.world.req(e, 'transform').x).toBeGreaterThan(before + 20);
    expect(game.world.req(game.player, 'health').shield).toBeGreaterThan(0);
  });

  it('Arcaniste arrives with a frost nova that slows', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 90, SPAWN.y);
    run(game, 1, { switchTo: 2 });
    expect(hasStatus(game.world, e, 'slow')).toBe(true);
    expect(game.world.req(e, 'health').hp).toBe(
      game.world.req(e, 'health').max - ARCANIST.entry.damage,
    );
  });
});

describe('KO & revive', () => {
  it('a KO hands over to the next member; the run continues', () => {
    const game = sandbox();
    const events = runCollect(game, 0);
    dealDamage(game, game.player, lethal);
    events.push(...game.drainEvents());
    expect(events.some((e) => e.type === 'ko')).toBe(true);
    expect(events.some((e) => e.type === 'playerDeath')).toBe(false);
    expect(game.playerAlive).toBe(true);
    expect(active(game)).toBe('guardian');
    expect(game.world.req(game.player, 'party').members[0]!.ko).toBe(true);
    // KO'd members can't be switched in.
    run(game, TEAM.switchCooldownTicks + 1);
    run(game, 1, { switchTo: 0 });
    expect(active(game)).toBe('guardian');
  });

  it('the run is lost only when all three are KO', () => {
    const game = sandbox();
    const all: string[] = [];
    for (let i = 0; i < 3; i++) {
      game.world.req(game.player, 'health').invuln = 0;
      game.world.req(game.player, 'health').shield = 0;
      dealDamage(game, game.player, lethal);
      all.push(...game.drainEvents().map((e) => e.type));
    }
    expect(all.filter((t) => t === 'ko')).toHaveLength(3);
    expect(all).toContain('playerDeath');
    expect(game.playerAlive).toBe(false);
  });

  it('KO’d members come back on the next floor', () => {
    const game = new Game('REVIVE', DT);
    dealDamage(game, game.player, lethal);
    game.descend();
    const blade = game.world.req(game.player, 'party').members[0]!;
    expect(blade.ko).toBe(false);
    expect(blade.health.hp).toBe(Math.round(SHADOW_BLADE.maxHp * TEAM.descendReviveFraction));
  });

  it('the altar revives KO’d members for a blood price (E)', () => {
    const game = new Game('ALTAR', DT);
    dealDamage(game, game.player, lethal); // blade KO → guardian
    const room = game.dungeon!.floor.rooms.find((r) => r.type === 'altar')!;
    const c = game.map.tileCenter(room.center.tx, room.center.ty);
    place(game, c.x + 16, c.y + 40);
    run(game, 15); // past the KO hit-stop, room entered
    const hpBefore = game.world.req(game.player, 'health').hp;
    const opened = runCollect(game, 1, { interactPressed: true });
    expect(opened.some((e) => e.type === 'altarOpen')).toBe(true);
    const events = runCollect(game, 1, { ui: { kind: 'altar', option: 'revive' } });
    expect(events.some((e) => e.type === 'revive')).toBe(true);
    expect(game.world.req(game.player, 'party').members[0]!.ko).toBe(false);
    expect(game.world.req(game.player, 'health').hp).toBeLessThan(hpBefore);
    // Single use.
    dealDamage(game, game.player, { ...lethal });
    game.drainEvents();
    const again = runCollect(game, 1, { ui: { kind: 'altar', option: 'revive' } });
    expect(again.some((e) => e.type === 'revive')).toBe(false);
  });
});
