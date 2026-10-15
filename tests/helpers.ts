import { Game } from '../src/game/game';
import type { GameEvent } from '../src/game/events';
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

export function place(game: Game, x: number, y: number): void {
  const t = game.world.req(game.player, 'transform');
  t.x = t.prevX = x;
  t.y = t.prevY = y;
}

/** Runs ticks while collecting every emitted event. */
export function runCollect(
  game: Game,
  ticks: number,
  input: Partial<InputFrame> = {},
): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    game.step({ ...emptyInput(), ...input });
    out.push(...game.drainEvents());
  }
  return out;
}

/** Player spawn in the test arena; rows 7-11 / cols 7-20 around it are open floor. */
export const SPAWN = { x: 432, y: 304 };
