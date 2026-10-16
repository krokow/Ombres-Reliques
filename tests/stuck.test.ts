import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { findFreeSpot, isFree, moveAndCollide, TileMap } from '../src/core/tilemap';
import { CLASS_IDS, type ClassId } from '../src/data/classes';
import { Game } from '../src/game/game';
import { spawnEnemy } from '../src/game/factories';
import { emptyInput } from '../src/game/inputFrame';
import { DT } from './helpers';

/** Chaotic player: random moves, every ability, constant hero switching. */
function chaos(game: Game, ticks: number, rng: Rng, check: (t: number) => void): void {
  let mx = 0;
  let my = 0;
  for (let t = 0; t < ticks; t++) {
    if (t % 20 === 0) {
      mx = rng.range(-1, 1);
      my = rng.range(-1, 1);
    }
    const pt = game.world.req(game.player, 'transform');
    game.step({
      ...emptyInput(),
      moveX: mx,
      moveY: my,
      aimX: pt.x + rng.range(-300, 300),
      aimY: pt.y + rng.range(-300, 300),
      attackHeld: rng.chance(0.5),
      attackPressed: rng.chance(0.1),
      rangedPressed: rng.chance(0.08),
      secondaryHeld: rng.chance(0.2),
      dashPressed: rng.chance(0.06),
      skillPressed: rng.chance(0.03),
      ultimatePressed: rng.chance(0.02),
      switchTo: rng.chance(0.02) ? rng.int(0, 2) : -1,
    });
    // Keep the ultimates coming and the party alive: we're testing movement.
    const p = game.world.req(game.player, 'player');
    if (t % 120 === 0) p.energy = 100;
    check(t);
  }
}

describe('Jamais coincé dans un mur', () => {
  const teams: ClassId[][] = [
    ['shadowBlade', 'guardian', 'arcanist'],
    ['summoner', 'berserker', 'guardian'],
    ['arcanist', 'summoner', 'shadowBlade'],
  ];

  it('random play over several floors keeps every body out of walls and inside the map', () => {
    for (let i = 0; i < 6; i++) {
      const team = teams[i % teams.length]!;
      const game = new Game(`STUCK${i}`, DT, { party: team, startLevel: 1 + i });
      game.godMode = true;
      const rng = new Rng(1000 + i);
      const map = (): TileMap => game.map;
      chaos(game, 2400, rng, (t) => {
        for (const [e, tr, b] of game.world.query('transform', 'body')) {
          if (!b.solid || game.world.isPendingDestroy(e)) continue;
          const ok = isFree(map(), tr.x, tr.y, b.radius);
          if (!ok)
            throw new Error(
              `seed ${i} tick ${t}: entity ${e} (${e === game.player ? 'player' : 'other'}) in a wall at ${tr.x.toFixed(1)},${tr.y.toFixed(1)}`,
            );
        }
      });
    }
  });

  it('every class can be switched in with its back to a wall', () => {
    for (const id of CLASS_IDS) {
      const others = CLASS_IDS.filter((c) => c !== id).slice(0, 2);
      const game = new Game('WALL', DT, {
        mode: 'arena',
        waves: false,
        party: [others[0]!, id, others[1]!],
      });
      const t = game.world.req(game.player, 'transform');
      // Hug the left wall with the narrow hero, then switch to a wider one.
      t.x = t.prevX = 32 + 10.01;
      game.world.req(game.player, 'party').switchCooldown = 0;
      game.step({ ...emptyInput(), switchTo: 1 });
      const b = game.world.req(game.player, 'body');
      expect(isFree(game.map, t.x, t.y, b.radius), id).toBe(true);
    }
  });

  it('a crowd of enemies pressing the player against a wall can neither bury nor pin them', () => {
    const game = new Game('CROWD', DT, { mode: 'arena', waves: false });
    game.godMode = true;
    const t = game.world.req(game.player, 'transform');
    t.x = t.prevX = 32 + 12;
    t.y = t.prevY = 304;
    for (let i = 0; i < 8; i++) spawnEnemy(game, 'ghoul', 90 + (i % 3) * 20, 260 + i * 12);
    for (let i = 0; i < 300; i++) {
      game.step({ ...emptyInput(), moveX: -1, aimX: 0, aimY: 304 });
      expect(isFree(game.map, t.x, t.y, game.world.req(game.player, 'body').radius)).toBe(true);
    }
    // Walking away through the crowd still works.
    const before = t.x;
    for (let i = 0; i < 120; i++) game.step({ ...emptyInput(), moveX: 1, aimX: 900, aimY: 304 });
    expect(t.x - before).toBeGreaterThan(60);
  });

  it('a body overlapping a wall steps out instead of freezing', () => {
    const { map } = TileMap.fromLayout(['#####', '#...#', '#...#', '#####'], 32);
    const r = moveAndCollide(map, 40, 48, 12, 5, 0);
    expect(isFree(map, r.x, r.y, 12)).toBe(true);
    expect(findFreeSpot(map, 0, 0, 10, 200)).not.toBeNull();
  });
});
