import { describe, expect, it } from 'vitest';
import { TileMap } from '../src/core/tilemap';
import { FlowField } from '../src/systems/navigation';
import { run, sandbox } from './helpers';
import { spawnEnemy } from '../src/game/factories';

describe('FlowField', () => {
  const { map } = TileMap.fromLayout(
    ['#######', '#.....#', '#.###.#', '#.#.#.#', '#.....#', '#######'],
    32,
  );

  it('computes BFS distances around walls', () => {
    const f = new FlowField(map);
    f.update(1, 1);
    expect(f.distanceAt(1, 1)).toBe(0);
    expect(f.distanceAt(5, 1)).toBe(4);
    // Pocket (3,3) opens only downwards: (1,1)→(1,4)→(3,4)→(3,3).
    expect(f.distanceAt(3, 3)).toBe(6);
    expect(f.distanceAt(2, 2)).toBe(-1); // wall
  });

  it('nextTile always descends and reaches the target', () => {
    const f = new FlowField(map);
    f.update(1, 1);
    let pos = { tx: 3, ty: 3 };
    for (let i = 0; i < 10 && (pos.tx !== 1 || pos.ty !== 1); i++) {
      const next = f.nextTile(pos.tx, pos.ty);
      expect(next).not.toBeNull();
      expect(f.distanceAt(next!.tx, next!.ty)).toBeLessThan(f.distanceAt(pos.tx, pos.ty));
      pos = next!;
    }
    expect(pos).toEqual({ tx: 1, ty: 1 });
  });

  it('never cuts corners diagonally', () => {
    const f = new FlowField(map);
    f.update(1, 1);
    // (2,3) is a wall, so (3,4) cannot shortcut diagonally towards (1,3).
    const next = f.nextTile(3, 4);
    expect(next).toEqual({ tx: 2, ty: 4 });
  });
});

describe('enemies navigate around obstacles', () => {
  it('a ghoul behind a pillar reaches the player', () => {
    const game = sandbox();
    const pt = game.world.req(game.player, 'transform');
    // Player at spawn (13,9); horizontal wall at row 6 cols 11-16. Put the ghoul right above it.
    const enemy = spawnEnemy(game, 'ghoul', 13.5 * 32, 5.5 * 32);
    game.world.req(enemy, 'enemy').cooldown = 9999;
    run(game, 360, { aimX: pt.x, aimY: pt.y });
    const et = game.world.req(enemy, 'transform');
    expect(Math.hypot(et.x - pt.x, et.y - pt.y)).toBeLessThan(40);
  });
});
