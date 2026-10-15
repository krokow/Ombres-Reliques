import { describe, expect, it } from 'vitest';
import { GUARDIAN } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { STATUSES } from '../src/data/statuses';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { hasStatus } from '../src/systems/statuses';
import { DT, playerPos, run, runCollect, SPAWN } from './helpers';

/** Sandbox with the Guardian active and no lingering entry effects. */
function guardian(): Game {
  const game = new Game('G', DT, {
    mode: 'arena',
    waves: false,
    party: ['guardian', 'shadowBlade', 'arcanist'],
  });
  // Fresh from combat: the passive shield hasn't rebuilt yet.
  game.world.req(game.player, 'health').sinceHit = 0;
  return game;
}

/** A ghoul right in front (+x) that attacks immediately. */
function attacker(game: Game, dx = 34): number {
  const e = spawnEnemy(game, 'ghoul', SPAWN.x + dx, SPAWN.y);
  game.world.req(e, 'enemy').cooldown = 0;
  game.world.req(e, 'facing').angle = Math.PI; // facing the player
  return e;
}

const hp = (game: Game): number => game.world.req(game.player, 'health').hp;

describe('Gardien', () => {
  it('blocking reduces frontal damage', () => {
    const game = guardian();
    attacker(game);
    // Raise the shield early (no parry), facing the ghoul.
    run(game, ENEMIES.ghoul.windupTicks + 10, {
      secondaryHeld: true,
      aimX: SPAWN.x + 200,
      aimY: SPAWN.y,
    });
    const taken = GUARDIAN.maxHp - hp(game);
    expect(taken).toBe(
      Math.max(1, Math.round(ENEMIES.ghoul.strike.damage * (1 - GUARDIAN.block.reduction))),
    );
  });

  it('the shield does not protect the back', () => {
    const game = guardian();
    attacker(game);
    run(game, ENEMIES.ghoul.windupTicks + 10, {
      secondaryHeld: true,
      aimX: SPAWN.x - 200,
      aimY: SPAWN.y,
    });
    expect(GUARDIAN.maxHp - hp(game)).toBe(ENEMIES.ghoul.strike.damage);
  });

  it('a perfectly timed block parries: no damage, attacker stunned, energy gained', () => {
    const game = guardian();
    const e = attacker(game);
    const aim = { aimX: SPAWN.x + 200, aimY: SPAWN.y };
    // Wait until just before the strike, then raise the shield.
    run(game, ENEMIES.ghoul.windupTicks - 3, aim);
    const events = runCollect(game, 12, { ...aim, secondaryHeld: true });
    expect(events.some((ev) => ev.type === 'parry')).toBe(true);
    expect(hp(game)).toBe(GUARDIAN.maxHp);
    expect(hasStatus(game.world, e, 'stun')).toBe(true);
    expect(game.world.req(game.player, 'player').energy).toBeGreaterThanOrEqual(
      GUARDIAN.block.parryEnergy,
    );
  });

  it('the shield pool absorbs damage before HP', () => {
    const game = guardian();
    game.world.req(game.player, 'health').shield = 10;
    attacker(game);
    run(game, ENEMIES.ghoul.windupTicks + 10, { aimX: SPAWN.x - 200, aimY: SPAWN.y });
    expect(hp(game)).toBe(GUARDIAN.maxHp - (ENEMIES.ghoul.strike.damage - 10));
    expect(game.world.req(game.player, 'health').shield).toBe(0);
  });

  it('passive: the shield regenerates out of combat', () => {
    const game = guardian();
    run(
      game,
      GUARDIAN.passive.regenDelayTicks +
        Math.ceil((GUARDIAN.passive.regenCap / GUARDIAN.passive.regenPerSecond) * 60) +
        5,
    );
    expect(game.world.req(game.player, 'health').shield).toBeCloseTo(GUARDIAN.passive.regenCap, 0);
  });

  it('charge bowls over enemies in its path', () => {
    const game = guardian();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 70, SPAWN.y);
    game.world.req(e, 'enemy').cooldown = 9999;
    run(game, 1, { dashPressed: true, moveX: 1, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    run(game, GUARDIAN.dash.durationTicks, { aimX: SPAWN.x + 300, aimY: SPAWN.y });
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
    expect(playerPos(game).x).toBeGreaterThan(SPAWN.x + 60);
  });

  it('taunt: ranged enemies close in and deal reduced damage; shield gained', () => {
    const game = guardian();
    const archer = spawnEnemy(game, 'boneArcher', SPAWN.x + 200, SPAWN.y);
    game.world.req(archer, 'enemy').cooldown = 9999;
    run(game, 1, { skillPressed: true });
    expect(hasStatus(game.world, archer, 'taunted')).toBe(true);
    expect(game.world.req(game.player, 'health').shield).toBeGreaterThanOrEqual(
      GUARDIAN.taunt.shield,
    );
    run(game, 90);
    const t = game.world.req(archer, 'transform');
    // An untaunted archer keeps ≥150 px; a taunted one walks up.
    expect(Math.hypot(t.x - SPAWN.x, t.y - SPAWN.y)).toBeLessThan(80);
    expect(STATUSES.taunted.damageDealtMult).toBeLessThan(1);
  });

  it('Bastion stuns everything around and grants a big shield', () => {
    const game = guardian();
    game.world.req(game.player, 'player').energy = GUARDIAN.ultimate.energyCost;
    const a = spawnEnemy(game, 'ghoul', SPAWN.x + 80, SPAWN.y);
    const b = spawnEnemy(game, 'ghoul', SPAWN.x - 80, SPAWN.y);
    run(game, 1, { ultimatePressed: true });
    for (const e of [a, b]) {
      expect(hasStatus(game.world, e, 'stun')).toBe(true);
      expect(game.world.req(e, 'health').hp).toBeLessThanOrEqual(
        ENEMIES.ghoul.maxHp - GUARDIAN.ultimate.damage,
      );
    }
    expect(game.world.req(game.player, 'health').shield).toBeGreaterThanOrEqual(
      GUARDIAN.ultimate.shield,
    );
  });

  it('gains energy from damage taken', () => {
    const game = guardian();
    attacker(game);
    run(game, ENEMIES.ghoul.windupTicks + 10, { aimX: SPAWN.x - 200, aimY: SPAWN.y });
    expect(game.world.req(game.player, 'player').energy).toBeCloseTo(
      ENEMIES.ghoul.strike.damage * GUARDIAN.energyPerDamageTaken,
    );
  });
});
