import { describe, expect, it } from 'vitest';
import { ARCANIST, GUARDIAN, SHADOW_BLADE, type ClassId } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { CARDS, cardById, PROGRESSION, TALENTS, xpToNext } from '../src/data/progression';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { dealDamage } from '../src/systems/damage';
import { addXp, applyProgressAction, canTakeTalent, recompute } from '../src/systems/progression';
import { hasStatus } from '../src/systems/statuses';
import { DT, run, runCollect, sandbox, SPAWN } from './helpers';

const kill = (game: Game, e: number): void => {
  dealDamage(game, e, {
    amount: 9999,
    source: game.player,
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
};

function party(game: Game) {
  return game.world.req(game.player, 'party');
}

function arena(first: ClassId): Game {
  const rest = (['shadowBlade', 'guardian', 'arcanist'] as ClassId[]).filter((c) => c !== first);
  return new Game('P', DT, { mode: 'arena', waves: false, party: [first, ...rest] });
}

/** Gives a member a specific card or talent directly (bypassing offers). */
function grant(game: Game, member: number, opts: { card?: string; talents?: string[] }): void {
  const m = party(game).members[member]!;
  if (opts.card) m.progress.cards[opts.card] = (m.progress.cards[opts.card] ?? 0) + 1;
  if (opts.talents) m.progress.talents.push(...opts.talents);
  recompute(m);
}

describe('experience & levels', () => {
  it('xp curve grows', () => {
    expect(xpToNext(1)).toBe(PROGRESSION.xpCurve.base);
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(4));
  });

  it('kills give full XP to the active character, reduced XP to the reserve', () => {
    const game = sandbox();
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 100, SPAWN.y, { alert: false });
    kill(game, e);
    const [a, b] = party(game).members;
    expect(a!.progress.xp).toBe(ENEMIES.ghoul.xp);
    expect(b!.progress.xp).toBe(Math.round(ENEMIES.ghoul.xp * PROGRESSION.reserveXpRate));
  });

  it('elites and champions are worth more; KO’d members earn nothing', () => {
    const game = sandbox();
    party(game).members[2]!.ko = true;
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 100, SPAWN.y, {
      elite: ['armored'],
      alert: false,
    });
    kill(game, e);
    expect(party(game).members[0]!.progress.xp).toBe(ENEMIES.ghoul.xp * PROGRESSION.eliteXpMult);
    expect(party(game).members[2]!.progress.xp).toBe(0);
  });

  it('levelling up banks a card choice; a talent point every 3 levels', () => {
    const game = sandbox();
    const m = party(game).members[0]!;
    let total = 0;
    for (let l = 1; l < 6; l++) total += xpToNext(l);
    addXp(game, m, total);
    expect(m.progress.level).toBe(6);
    expect(m.progress.pendingCards).toBe(5);
    expect(m.progress.talentPoints).toBe(2);
    expect(game.events.filter((e) => e.type === 'levelUp')).toHaveLength(5);
  });

  it('design 1b: the game never pauses on level-up', () => {
    const game = sandbox();
    const m = party(game).members[0]!;
    addXp(game, m, xpToNext(1));
    const tick = game.tick;
    run(game, 5);
    expect(game.tick).toBe(tick + 5);
    expect(m.progress.pendingCards).toBe(1);
  });
});

describe('card offers', () => {
  it('offers 3 distinct eligible cards, seeded', () => {
    const offers = ['S1', 'S1', 'S2'].map((seed) => {
      const game = new Game(seed, DT, { mode: 'arena', waves: false });
      const m = party(game).members[0]!;
      addXp(game, m, xpToNext(1));
      return m.progress.offer!;
    });
    expect(offers[0]).toEqual(offers[1]);
    for (const offer of offers) {
      expect(new Set(offer).size).toBe(PROGRESSION.cardsPerOffer);
      for (const id of offer) {
        const c = cardById(id)!;
        expect(c.classId === null || c.classId === 'shadowBlade').toBe(true);
        expect(c.minLevel).toBeLessThanOrEqual(2);
      }
    }
  });

  it('never offers another class’s cards nor maxed-out cards', () => {
    const game = sandbox();
    const m = party(game).members[1]!; // guardian
    for (const c of CARDS) if (c.classId === null) m.progress.cards[c.id] = c.maxStacks;
    recompute(m);
    addXp(game, m, xpToNext(1) + xpToNext(2) + xpToNext(3) + xpToNext(4));
    for (const id of m.progress.offer!) expect(cardById(id)!.classId).toBe('guardian');
  });

  it('choosing a card applies it and rolls the next offer', () => {
    const game = sandbox();
    const m = party(game).members[0]!;
    addXp(game, m, xpToNext(1) + xpToNext(2));
    m.progress.offer = ['vigor', 'might', 'precision'];
    run(game, 1, { progress: { kind: 'card', member: 0, slot: 0 } });
    expect(m.progress.cards.vigor).toBe(1);
    expect(m.progress.pendingCards).toBe(1);
    expect(m.health.max).toBe(Math.round(SHADOW_BLADE.maxHp * 1.12));
    expect(m.progress.offer).toHaveLength(3);
  });

  it('invalid picks are ignored', () => {
    const game = sandbox();
    expect(applyProgressAction(game, { kind: 'card', member: 0, slot: 0 })).toBe(false);
    expect(applyProgressAction(game, { kind: 'talent', member: 0, node: 'sb-f1' })).toBe(false);
  });
});

describe('talents', () => {
  it('branches are bought in order and cost points', () => {
    const game = sandbox();
    const m = party(game).members[0]!;
    m.progress.talentPoints = 2;
    expect(canTakeTalent(m, 'sb-m2')).toBe(false);
    expect(applyProgressAction(game, { kind: 'talent', member: 0, node: 'sb-m1' })).toBe(true);
    expect(canTakeTalent(m, 'sb-m2')).toBe(true);
    expect(applyProgressAction(game, { kind: 'talent', member: 0, node: 'sb-m2' })).toBe(true);
    expect(m.progress.talentPoints).toBe(0);
    expect(canTakeTalent(m, 'sb-m3')).toBe(false);
    expect(m.mods.extraDashCharges).toBe(1);
  });

  it('every class has 3 branches of 3 nodes', () => {
    for (const branches of Object.values(TALENTS)) {
      expect(branches).toHaveLength(3);
      for (const b of branches) expect(b.nodes).toHaveLength(3);
    }
  });

  it('extra dash charge works in play', () => {
    const game = sandbox();
    grant(game, 0, { talents: ['sb-m1', 'sb-m2'] });
    run(game, SHADOW_BLADE.dash.rechargeTicks * 2);
    expect(game.world.req(game.player, 'dash').charges).toBe(SHADOW_BLADE.dash.maxCharges + 1);
  });

  it('Reset total: a kill refills every dash charge', () => {
    const game = sandbox();
    grant(game, 0, { talents: ['sb-m1', 'sb-m2', 'sb-m3'] });
    game.world.req(game.player, 'dash').charges = 0;
    kill(game, spawnEnemy(game, 'ghoul', SPAWN.x + 60, SPAWN.y, { alert: false }));
    expect(game.world.req(game.player, 'dash').charges).toBe(SHADOW_BLADE.dash.maxCharges + 1);
  });

  it('cooldown reduction shortens skills', () => {
    const game = sandbox();
    grant(game, 0, { talents: ['sb-f1'] });
    run(game, 1, { skillPressed: true });
    expect(game.world.req(game.player, 'player').skillCooldown).toBeLessThanOrEqual(
      Math.round(SHADOW_BLADE.veil.cooldownTicks * 0.8),
    );
  });

  it('damage cards raise damage dealt', () => {
    const game = sandbox();
    grant(game, 0, { card: 'might' });
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 100, SPAWN.y, { alert: false });
    dealDamage(game, e, {
      amount: 100,
      source: game.player,
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
    expect(game.events.find((ev) => ev.type === 'hit')).toMatchObject({ damage: 108 });
  });
});

describe('evolutions & capstones', () => {
  it('Danse des lames: the dash leaves a damaging trail', () => {
    const game = sandbox();
    grant(game, 0, { card: 'bladeDance' });
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 80, SPAWN.y + 6, { alert: false });
    game.world.req(e, 'enemy').cooldown = 9999;
    run(game, 1, { dashPressed: true, moveX: 1, aimX: SPAWN.x + 500, aimY: SPAWN.y });
    run(game, 20, { aimX: SPAWN.x + 500, aimY: SPAWN.y });
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
  });

  it('Éventail: three shurikens per throw', () => {
    const game = sandbox();
    grant(game, 0, { card: 'shurikenFan' });
    run(game, 1, { rangedPressed: true, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    expect(game.world.query('projectile')).toHaveLength(3);
  });

  it('Épines: blocking reflects damage to the attacker', () => {
    const game = arena('guardian');
    grant(game, 0, { card: 'thorns' });
    game.world.req(game.player, 'health').sinceHit = 0;
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 34, SPAWN.y);
    game.world.req(e, 'enemy').cooldown = 0;
    game.world.req(e, 'facing').angle = Math.PI;
    run(game, ENEMIES.ghoul.windupTicks + 10, {
      secondaryHeld: true,
      aimX: SPAWN.x + 200,
      aimY: SPAWN.y,
    });
    expect(game.world.req(e, 'health').hp).toBeLessThan(ENEMIES.ghoul.maxHp);
  });

  it('Séisme: the charge ends with a stunning shockwave', () => {
    const game = arena('guardian');
    grant(game, 0, { card: 'earthshaker' });
    // Beside the end of the charge path (not bowled over by the charge itself).
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 130, SPAWN.y + 60, { alert: false });
    run(game, 1, { dashPressed: true, moveX: 1, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    const events = runCollect(game, GUARDIAN.dash.durationTicks + 2, {
      aimX: SPAWN.x + 300,
      aimY: SPAWN.y,
    });
    expect(events.some((ev) => ev.type === 'shockwave')).toBe(true);
    expect(hasStatus(game.world, e, 'stun')).toBe(true);
  });

  it('Fracture: frost on an already-slowed enemy freezes it', () => {
    const game = arena('arcanist');
    grant(game, 0, { card: 'shatter' });
    const e = spawnEnemy(game, 'ghoul', SPAWN.x + 200, SPAWN.y, { alert: false });
    run(game, 1, { rangedPressed: true, aimX: SPAWN.x + 200, aimY: SPAWN.y });
    run(game, ARCANIST.frostOrb.cooldownTicks + 5, { aimX: SPAWN.x + 200, aimY: SPAWN.y });
    expect(hasStatus(game.world, e, 'stun')).toBe(false);
    run(game, 1, { rangedPressed: true, aimX: SPAWN.x + 200, aimY: SPAWN.y });
    run(game, 40, { aimX: SPAWN.x + 200, aimY: SPAWN.y });
    expect(hasStatus(game.world, e, 'stun')).toBe(true);
  });

  it('Traits jumeaux: every other bolt is empowered', () => {
    const game = arena('arcanist');
    grant(game, 0, { talents: ['ar-a1', 'ar-a2', 'ar-a3'] });
    const events = runCollect(game, 40, { attackHeld: true, aimX: SPAWN.x + 300, aimY: SPAWN.y });
    const spells = events.flatMap((e) => (e.type === 'cast' ? [e.spell] : []));
    expect(spells.slice(0, 4)).toEqual(['bolt', 'empowered', 'bolt', 'empowered']);
  });

  it('Cratères: meteors leave fire behind', () => {
    const game = arena('arcanist');
    grant(game, 0, { talents: ['ar-f1', 'ar-f2', 'ar-f3'] });
    game.world.req(game.player, 'player').energy = ARCANIST.ultimate.energyCost;
    run(game, 1, { ultimatePressed: true, aimX: SPAWN.x + 150, aimY: SPAWN.y });
    run(game, ARCANIST.ultimate.fallTicks + 5, { aimX: SPAWN.x + 150, aimY: SPAWN.y });
    expect(game.world.query('zone').some(([, z]) => z.kind === 'fire')).toBe(true);
  });

  it('Ralliement: Bastion heals the reserve', () => {
    const game = arena('guardian');
    grant(game, 0, { talents: ['gd-k1', 'gd-k2', 'gd-k3'] });
    const reserve = party(game).members[1]!;
    reserve.health.hp = 10;
    game.world.req(game.player, 'player').energy = GUARDIAN.ultimate.energyCost;
    run(game, 1, { ultimatePressed: true });
    expect(reserve.health.hp).toBeGreaterThan(10 + reserve.health.max * 0.2);
  });
});
