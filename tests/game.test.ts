import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { emptyInput } from '../src/game/inputFrame';
import { PLAYER_PROTOTYPE } from '../src/data/config';

describe('Game (headless)', () => {
  it('moves the player at its configured speed', () => {
    const game = new Game('TEST', 1 / 60);
    for (let i = 0; i < 60; i++) game.step({ ...emptyInput(), moveX: 1 });
    const t = game.world.req(game.player, 'transform');
    expect(t.x).toBeCloseTo(PLAYER_PROTOTYPE.moveSpeed, 5);
    expect(t.y).toBe(0);
  });
});
