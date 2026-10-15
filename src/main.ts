import { Sfx } from './audio/sfx';
import { FixedStepClock, FpsCounter, runLoop } from './core/loop';
import { lerp, normalize } from './core/math';
import { normalizeSeed, seedFromNumber } from './core/rng';
import { CLASSES } from './data/classes';
import { ENGINE } from './data/config';
import { ENEMIES, isEnemyId } from './data/enemies';
import { Game } from './game/game';
import { spawnGroup } from './systems/waves';
import { emptyInput, type InputFrame } from './game/inputFrame';
import { KeyboardMouse } from './input/keyboardMouse';
import { Camera } from './render/camera';
import { Effects } from './render/effects';
import { Hud } from './render/hud';
import { Renderer } from './render/renderer';
import { CommandRegistry } from './ui/commands';
import { DebugOverlay } from './ui/debugOverlay';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');

function randomSeed(): string {
  // The only non-deterministic draw in the game: choosing a fresh seed.
  return seedFromNumber(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0);
}

function initialSeed(): string {
  const fromUrl = new URLSearchParams(location.search).get('seed');
  return fromUrl ? normalizeSeed(fromUrl) : randomSeed();
}

const clock = new FixedStepClock(ENGINE.tickRate, ENGINE.maxStepsPerFrame);
const fps = new FpsCounter();
const renderer = new Renderer(canvas);
const camera = new Camera();
const input = new KeyboardMouse(canvas);
const sfx = new Sfx();
const hud = new Hud();
const commands = new CommandRegistry();
const debug = new DebugOverlay(uiRoot, commands);
let fx = new Effects();
let game = newGame(initialSeed());

function newGame(seed: string): Game {
  const g = new Game(normalizeSeed(seed), clock.stepSeconds);
  const t = g.world.req(g.player, 'transform');
  camera.snapTo(t.x, t.y);
  fx = new Effects();
  game = g;
  return g;
}

function registerCommands(): void {
  const heal = (): string => {
    const h = game.world.req(game.player, 'health');
    h.hp = h.max;
    return 'PV restaurés';
  };
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
    run: () => (newGame(game.seed), `Relancé (seed ${game.seed})`),
  });
  commands.register('heal', { help: 'soigne complètement', run: heal });
  commands.register('god', {
    help: 'invincibilité on/off',
    run: () => ((game.godMode = !game.godMode), `God mode ${game.godMode ? 'ON' : 'OFF'}`),
  });
  commands.register('spawn', {
    help: `spawn <${Object.keys(ENEMIES).join('|')}> [n]`,
    run: ([id = 'ghoul', n = '1']) => {
      if (!isEnemyId(id)) return `Ennemi inconnu : ${id}`;
      return `${spawnGroup(game, id, Math.max(1, Number(n) || 1))} ${ENEMIES[id].name}(s) invoquée(s)`;
    },
  });
  commands.register('killall', {
    help: 'détruit tous les ennemis',
    run: () => {
      const enemies = game.world.query('enemy');
      for (const [e] of enemies) game.world.destroy(e);
      return `${enemies.length} ennemi(s) détruit(s)`;
    },
  });
  commands.register('dash', {
    help: 'recharge les dashs',
    run: () => {
      const d = game.world.req(game.player, 'dash');
      d.charges = CLASSES[game.world.req(game.player, 'player').classId].dash.maxCharges;
      return 'Dashs rechargés';
    },
  });
}
registerCommands();

function sampleInput(): InputFrame {
  const dir = normalize(
    (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0),
    (input.isHeld('down') ? 1 : 0) - (input.isHeld('up') ? 1 : 0),
  );
  const aim = camera.screenToWorld(input.mouseX, input.mouseY);
  return {
    moveX: dir.x,
    moveY: dir.y,
    aimX: aim.x,
    aimY: aim.y,
    attackHeld: input.isHeld('attack'),
    attackPressed: input.consumePressed('attack'),
    rangedPressed: input.consumePressed('ranged'),
    dashPressed: input.consumePressed('dash'),
  };
}

function handleMetaKeys(): void {
  if (input.consumePressed('toggleConsole')) debug.toggleConsole();
  if (input.consumePressed('toggleDebug')) debug.toggle();
  if (input.consumePressed('toggleHitboxes')) debug.showHitboxes = !debug.showHitboxes;
  if (input.consumePressed('mute')) debug.print(sfx.toggleMute() ? 'Son coupé' : 'Son activé');
  input.suspended = debug.consoleOpen;
  if (!game.playerAlive) {
    if (input.consumePressed('confirm')) newGame(randomSeed());
    else if (input.consumePressed('retrySameSeed')) newGame(game.seed);
  }
}

function resize(): void {
  renderer.resize();
  camera.setViewport(renderer.width, renderer.height);
}
window.addEventListener('resize', resize);
resize();

let ghostTimer = 0;

runLoop(clock, {
  update() {
    handleMetaKeys();
    const aim = camera.screenToWorld(input.mouseX, input.mouseY);
    game.step(input.suspended ? { ...emptyInput(), aimX: aim.x, aimY: aim.y } : sampleInput());
  },
  render(alpha, frameMs) {
    handleMetaKeys();
    const dt = Math.min(frameMs, 100) / 1000;
    fps.frame(frameMs);
    for (const ev of game.drainEvents()) {
      fx.handle(ev, camera);
      sfx.onEvent(ev);
    }

    const w = game.world;
    const t = w.req(game.player, 'transform');
    const px = lerp(t.prevX, t.x, alpha);
    const py = lerp(t.prevY, t.y, alpha);
    // Dash afterimages, emitted at a fixed rate regardless of FPS.
    ghostTimer -= dt;
    if (w.req(game.player, 'dash').active > 0 && ghostTimer <= 0) {
      fx.addGhost(px, py, w.req(game.player, 'facing').angle);
      ghostTimer = 0.016;
    }

    fx.update(dt);
    camera.follow({ x: px, y: py }, camera.screenToWorld(input.mouseX, input.mouseY), dt);
    renderer.render(game, camera, fx, alpha, dt, { showHitboxes: debug.showHitboxes });
    renderer.screenSpace();
    hud.draw(renderer.ctx, renderer.width, renderer.height, game, fx, dt);

    debug.setLines([
      `FPS      ${fps.fps.toFixed(0)}`,
      `Tick     ${game.tick}${game.hitstopTicks > 0 ? '  (hit-stop)' : ''}`,
      `Entités  ${w.entityCount}`,
      `Seed     ${game.seed}`,
      `Joueur   ${t.x.toFixed(0)}, ${t.y.toFixed(0)}${game.godMode ? '  GOD' : ''}`,
      ``,
      `ZQSD/WASD bouger · clic G attaque · clic D shuriken`,
      `Espace dash · M son · F3 debug · F4 hitboxes · ² console`,
    ]);
  },
});
