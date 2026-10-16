import { describe, expect, it } from 'vitest';
import { BERSERKER, SUMMONER } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { dealDamage } from '../src/systems/damage';
import { applyProgressAction } from '../src/systems/progression';
import { hasStatus } from '../src/systems/statuses';
import { switchTo } from '../src/systems/team';
import { DT, playerPos, run, runCollect, settle, SPAWN } from './helpers';

function team(first: 'summoner' | 'berserker'): Game {
  return new Game('S', DT, {
    mode: 'arena',
    waves: false,
    party: [first, 'guardian', first === 'summoner' ? 'berserker' : 'summoner'],
  });
}

const passive = (game: Game, x: number, y = SPAWN.y): number => {
  const e = spawnEnemy(game, 'ghoul', x, y);
  game.world.req(e, 'enemy').cooldown = 9999;
  game.world.req(e, 'facing').angle = Math.PI;
  return e;
};

const allies = (game: Game, kind?: 'wisp' | 'colossus'): number =>
  game.world.query('ally').filter(([, a]) => !kind || a.kind === kind).length;

function hurtPlayer(game: Game, amount: number): void {
  const h = game.world.req(game.player, 'health');
  h.invuln = 0;
  dealDamage(game, game.player, {
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
}

describe('Invocateur', () => {
  it('calls wisps with the skill, capped by the maximum', () => {
    const game = team('summoner');
    run(game, 1, { skillPressed: true });
    expect(allies(game, 'wisp')).toBe(SUMMONER.summon.count);
    game.world.req(game.player, 'player').skillCooldown = 0;
    run(game, 1, { skillPressed: true });
    game.world.req(game.player, 'player').skillCooldown = 0;
    run(game, 1, { skillPressed: true });
    expect(allies(game, 'wisp')).toBe(SUMMONER.summon.maxWisps);
  });

  it('wisps hunt enemies on their own and the damage is credited to the party', () => {
    const game = team('summoner');
    run(game, 1, { skillPressed: true });
    const e = passive(game, SPAWN.x + 120);
    run(game, 180);
    expect(game.world.isAlive(e) ? game.world.req(e, 'health').hp : 0).toBeLessThan(
      ENEMIES.ghoul.maxHp,
    );
    // Their hits charge the summoner's ultimate, without hit-stop spam.
    expect(game.world.req(game.player, 'player').energy).toBeGreaterThan(0);
  });

  it('wisps fade after their lifetime', () => {
    const game = team('summoner');
    run(game, 1, { skillPressed: true });
    run(game, SUMMONER.wisp.lifeTicks + 5);
    expect(allies(game)).toBe(0);
  });

  it('the lash reaches far and marks; summons prefer marked enemies', () => {
    const game = team('summoner');
    const e = passive(game, SPAWN.x + 90);
    run(game, 20, { attackPressed: true, aimX: SPAWN.x + 200, aimY: SPAWN.y });
    settle(game);
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
    expect(hasStatus(game.world, e, 'mark')).toBe(true);
  });

  it('"Ordre" sends every summon at the enemy under the cursor', () => {
    const game = team('summoner');
    run(game, 1, { skillPressed: true });
    passive(game, SPAWN.x - 100);
    const far = passive(game, SPAWN.x + 160);
    const events = runCollect(game, 1, { rangedPressed: true, aimX: SPAWN.x + 160, aimY: SPAWN.y });
    expect(events.some((ev) => ev.type === 'command' && ev.target === far)).toBe(true);
    for (const [, a] of game.world.query('ally')) {
      expect(a.target).toBe(far);
      expect(a.rush).toBeGreaterThan(0);
    }
  });

  it('mobility swaps places with the wisp nearest the cursor', () => {
    const game = team('summoner');
    run(game, 1, { skillPressed: true });
    run(game, 30);
    const [wisp, , wt] = game.world.query('ally', 'transform')[0] ?? [];
    expect(wisp).toBeDefined();
    if (!wt) return;
    const target = { x: wt.x, y: wt.y };
    const before = playerPos(game);
    run(game, 1, { dashPressed: true, aimX: target.x, aimY: target.y });
    const after = playerPos(game);
    expect(Math.hypot(after.x - target.x, after.y - target.y)).toBeLessThan(25);
    expect(Math.hypot(wt.x - before.x, wt.y - before.y)).toBeLessThan(25);
  });

  it('the ultimate raises a bone colossus that slams enemies', () => {
    const game = team('summoner');
    game.world.req(game.player, 'player').energy = 100;
    const e = passive(game, SPAWN.x + 70);
    run(game, 1, { ultimatePressed: true, aimX: SPAWN.x + 40, aimY: SPAWN.y });
    expect(allies(game, 'colossus')).toBe(1);
    const events = runCollect(game, 120);
    expect(events.some((ev) => ev.type === 'allyStrike' && ev.kind === 'colossus')).toBe(true);
    expect(game.world.isAlive(e) ? game.world.req(e, 'health').hp : 0).toBeLessThan(
      ENEMIES.ghoul.maxHp,
    );
  });

  it('enemy attacks can destroy summons', () => {
    const game = team('summoner');
    run(game, 1, { skillPressed: true });
    const [wisp] = game.world.query('ally')[0] ?? [];
    if (wisp === undefined) throw new Error('no wisp');
    game.world.req(wisp, 'health').invuln = 0;
    dealDamage(game, wisp, {
      amount: 999,
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
    game.world.flush();
    expect(game.world.isAlive(wisp)).toBe(false);
    expect(game.playerAlive).toBe(true);
  });

  it('switch-in brings two wisps, and they keep fighting from the reserve', () => {
    const g = new Game('S', DT, {
      mode: 'arena',
      waves: false,
      party: ['guardian', 'summoner', 'berserker'],
    });
    switchTo(g, 1);
    expect(allies(g, 'wisp')).toBe(SUMMONER.entry.wisps);
    g.world.req(g.player, 'party').switchCooldown = 0;
    g.world.req(g.player, 'party').members[0]!.lockout = 0;
    switchTo(g, 0);
    expect(allies(g, 'wisp')).toBe(SUMMONER.entry.wisps);
  });

  it('evolution "Tempête d\'âmes": fading wisps burst', () => {
    const game = team('summoner');
    const m = game.world.req(game.player, 'party').members[0]!;
    m.progress.pendingCards = 1;
    m.progress.offer = ['soulStorm'];
    applyProgressAction(game, { kind: 'card', member: 0, slot: 0 });
    run(game, 1, { skillPressed: true });
    const events = runCollect(game, SUMMONER.wisp.lifeTicks + 5);
    expect(events.some((ev) => ev.type === 'allyFade' && ev.burst)).toBe(true);
  });
});

describe('Berserker', () => {
  it('rage builds by hitting and being hit, then decays out of combat', () => {
    const game = team('berserker');
    const p = game.world.req(game.player, 'player');
    passive(game, SPAWN.x + 30);
    run(game, 20, { attackPressed: true, aimX: SPAWN.x + 100, aimY: SPAWN.y });
    const afterHit = p.rage;
    expect(afterHit).toBeGreaterThan(0);
    settle(game);
    hurtPlayer(game, 10);
    expect(p.rage).toBeGreaterThan(afterHit);
    const peak = p.rage;
    run(game, BERSERKER.rage.decayDelayTicks + 120);
    expect(p.rage).toBeLessThan(peak);
  });

  it('rage makes hits stronger', () => {
    const calm = team('berserker');
    const angry = team('berserker');
    angry.world.req(angry.player, 'player').rage = BERSERKER.rage.max;
    const hpAfter = (g: Game): number => {
      const e = passive(g, SPAWN.x + 30);
      g.world.req(e, 'health').hp = g.world.req(e, 'health').max = 500;
      run(g, 12, { attackPressed: true, aimX: SPAWN.x + 100, aimY: SPAWN.y });
      return g.world.req(e, 'health').hp;
    };
    expect(hpAfter(angry)).toBeLessThan(hpAfter(calm));
  });

  it('the whirlwind costs HP and hits all around repeatedly', () => {
    const game = team('berserker');
    const h = game.world.req(game.player, 'health');
    const left = passive(game, SPAWN.x - 40);
    const right = passive(game, SPAWN.x + 40);
    for (const e of [left, right])
      game.world.req(e, 'health').hp = game.world.req(e, 'health').max = 500;
    run(game, 1, { skillPressed: true });
    expect(h.hp).toBeLessThan(h.max);
    const events = runCollect(game, BERSERKER.spin.durationTicks);
    expect(events.filter((ev) => ev.type === 'spin').length).toBeGreaterThanOrEqual(5);
    for (const e of [left, right]) expect(game.world.req(e, 'health').hp).toBeLessThan(470);
  });

  it('frenzy keeps the berserker alive at 1 HP', () => {
    const game = team('berserker');
    game.world.req(game.player, 'player').energy = 100;
    run(game, 1, { ultimatePressed: true });
    expect(game.world.req(game.player, 'player').frenzy).toBeGreaterThan(0);
    hurtPlayer(game, 99999);
    expect(game.world.req(game.player, 'health').hp).toBe(1);
    expect(game.world.req(game.player, 'party').members[0]!.ko).toBe(false);
  });

  it('the leap crashes down on landing', () => {
    const game = team('berserker');
    const e = passive(game, SPAWN.x + 130);
    const events = runCollect(game, 30, {
      dashPressed: true,
      moveX: 1,
      aimX: SPAWN.x + 200,
      aimY: SPAWN.y,
    });
    expect(events.some((ev) => ev.type === 'shockwave' && ev.color === 'blood')).toBe(true);
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
  });

  it('thrown axes pierce and slow', () => {
    const game = team('berserker');
    const a = passive(game, SPAWN.x + 80);
    const b = passive(game, SPAWN.x + 140);
    run(game, 1, { rangedPressed: true, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    run(game, 30, { aimX: SPAWN.x + 300, aimY: SPAWN.y });
    for (const e of [a, b]) {
      expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
      expect(hasStatus(game.world, e, 'slow')).toBe(true);
    }
  });
});
