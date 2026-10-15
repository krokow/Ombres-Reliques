import { FixedStepClock, FpsCounter, runLoop } from './core/loop';
import { normalize } from './core/math';
import { normalizeSeed, seedFromNumber } from './core/rng';
import { ENGINE } from './data/config';
import { Game } from './game/game';
import type { InputFrame } from './game/inputFrame';
import { KeyboardMouse } from './input/keyboardMouse';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { CommandRegistry } from './ui/commands';
import { DebugOverlay } from './ui/debugOverlay';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');

function initialSeed(): string {
  const fromUrl = new URLSearchParams(location.search).get('seed');
  if (fromUrl) return normalizeSeed(fromUrl);
  // The only non-deterministic draw in the game: choosing a fresh seed.
  return seedFromNumber(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0);
}

const clock = new FixedStepClock(ENGINE.tickRate, ENGINE.maxStepsPerFrame);
const fps = new FpsCounter();
const renderer = new Renderer(canvas);
const camera = new Camera();
const input = new KeyboardMouse(canvas);
const commands = new CommandRegistry();
const debug = new DebugOverlay(uiRoot, commands);

let game = new Game(initialSeed(), clock.stepSeconds);

function newGame(seed: string): void {
  game = new Game(normalizeSeed(seed), clock.stepSeconds);
  const t = game.world.req(game.player, 'transform');
  camera.snapTo(t.x, t.y);
}

commands.register('seed', {
  help: 'seed [valeur] — affiche le seed, ou relance avec un nouveau',
  run: ([value]) => {
    if (!value) return `Seed : ${game.seed}`;
    newGame(value);
    return `Nouvelle partie, seed ${game.seed}`;
  },
});
commands.register('restart', {
  help: 'relance avec le même seed',
  run: () => {
    newGame(game.seed);
    return `Relancé (seed ${game.seed})`;
  },
});

function sampleInput(): InputFrame {
  const dir = normalize(
    (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0),
    (input.isHeld('down') ? 1 : 0) - (input.isHeld('up') ? 1 : 0),
  );
  const aim = camera.screenToWorld(input.mouseX, input.mouseY);
  const frame: InputFrame = { moveX: dir.x, moveY: dir.y, aimX: aim.x, aimY: aim.y };
  input.clearEdges();
  return frame;
}

function handleMetaKeys(): void {
  if (input.consumePressed('toggleConsole')) debug.toggleConsole();
  if (input.consumePressed('toggleDebug')) debug.toggle();
  if (input.consumePressed('toggleHitboxes')) debug.showHitboxes = !debug.showHitboxes;
  input.suspended = debug.consoleOpen;
}

function resize(): void {
  renderer.resize();
  camera.setViewport(renderer.width, renderer.height);
}
window.addEventListener('resize', resize);
resize();

runLoop(clock, {
  update() {
    handleMetaKeys();
    game.step(input.suspended ? { moveX: 0, moveY: 0, aimX: 0, aimY: 0 } : sampleInput());
  },
  render(alpha, frameMs) {
    handleMetaKeys();
    fps.frame(frameMs);
    const t = game.world.req(game.player, 'transform');
    const px = t.prevX + (t.x - t.prevX) * alpha;
    const py = t.prevY + (t.y - t.prevY) * alpha;
    camera.follow(
      { x: px, y: py },
      camera.screenToWorld(input.mouseX, input.mouseY),
      frameMs / 1000,
    );
    renderer.render(game, camera, alpha, { showHitboxes: debug.showHitboxes });
    debug.setLines([
      `FPS      ${fps.fps.toFixed(0)}`,
      `Tick     ${game.tick}`,
      `Entités  ${game.world.entityCount}`,
      `Seed     ${game.seed}`,
      `Joueur   ${t.x.toFixed(0)}, ${t.y.toFixed(0)}`,
      `F3 debug · F4 hitboxes · ² console`,
    ]);
  },
});
