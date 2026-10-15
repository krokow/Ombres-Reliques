import { Game } from '../src/game/game';
import { emptyInput, type InputFrame } from '../src/game/inputFrame';

export const DT = 1 / 60;

export function sandbox(seed = 'TEST'): Game {
  return new Game(seed, DT, { waves: false });
}

export function run(game: Game, ticks: number, input: Partial<InputFrame> = {}): void {
  for (let i = 0; i < ticks; i++) game.step({ ...emptyInput(), ...input });
}

/** Runs until no hit-stop is pending, so following assertions see a "live" sim. */
export function settle(game: Game): void {
  let guard = 0;
  while (game.hitstopTicks > 0 && guard++ < 100) game.step(emptyInput());
}

export function playerPos(game: Game): { x: number; y: number } {
  const t = game.world.req(game.player, 'transform');
  return { x: t.x, y: t.y };
}
