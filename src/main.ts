import { Sfx } from './audio/sfx';
import { FixedStepClock, FpsCounter, runLoop } from './core/loop';
import { lerp, normalize } from './core/math';
import { normalizeSeed, seedFromNumber } from './core/rng';
import { classDef } from './data/classes';
import { ENGINE } from './data/config';
import { ELITE_MODIFIERS, type EliteModifierId } from './data/elites';
import { ENEMIES, isEnemyId, type EnemyId } from './data/enemies';
import { STATUSES, type StatusId } from './data/statuses';
import { applyStatus } from './systems/statuses';
import { loadKeyLayout } from './input/keyLabels';
import { Game } from './game/game';
import { revealAll } from './systems/dungeon';
import { dealDamage } from './systems/damage';
import { reviveAll } from './systems/team';
import { addXp } from './systems/progression';
import { spawnGroup } from './systems/waves';
import { emptyInput, type InputFrame } from './game/inputFrame';
import { KeyboardMouse } from './input/keyboardMouse';
import { Camera } from './render/camera';
import { Effects } from './render/effects';
import { Hud } from './render/hud';
import { Minimap } from './render/minimap';
import { Animator } from './render/anim';
import { Renderer } from './render/renderer';
import { CommandRegistry } from './ui/commands';
import { DebugOverlay } from './ui/debugOverlay';
import { ProgressPanel } from './ui/progressPanel';
import { AltarPanel, ComparePanel } from './ui/lootPanels';

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
const minimap = new Minimap();
const progressPanel = new ProgressPanel(uiRoot);
const comparePanel = new ComparePanel(uiRoot);
const altarPanel = new AltarPanel(uiRoot);
let anim = new Animator();
const commands = new CommandRegistry();
const debug = new DebugOverlay(uiRoot, commands);
let fx = new Effects();
let game = newGame(initialSeed());

function newGame(seed: string, mode: 'dungeon' | 'arena' = 'dungeon', startLevel = 1): Game {
  const g = new Game(normalizeSeed(seed), clock.stepSeconds, { mode, startLevel });
  const t = g.world.req(g.player, 'transform');
  camera.snapTo(t.x, t.y);
  fx = new Effects();
  anim = new Animator();
  game = g;
  return g;
}

/** Case-insensitive lookup so "bonearcher" works in the console. */
function resolveEnemyId(raw: string): EnemyId | null {
  const id = Object.keys(ENEMIES).find((k) => k.toLowerCase() === raw.toLowerCase());
  return id && isEnemyId(id) ? id : null;
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
    run: ([raw = 'ghoul', n = '1']) => {
      const id = resolveEnemyId(raw);
      if (!id) return `Ennemi inconnu : ${raw}`;
      return `${spawnGroup(game, id, Math.max(1, Number(n) || 1))} ${ENEMIES[id].name}(s) invoquée(s)`;
    },
  });
  commands.register('elite', {
    help: `elite <ennemi> [${Object.keys(ELITE_MODIFIERS).join('|')}] — invoque une élite`,
    run: ([raw = 'ghoul', mod]) => {
      const id = resolveEnemyId(raw);
      if (!id) return `Ennemi inconnu : ${raw}`;
      const mods = Object.keys(ELITE_MODIFIERS) as EliteModifierId[];
      const chosen =
        mod && (mods as string[]).includes(mod)
          ? (mod as EliteModifierId)
          : game.rng.spawn.pick(mods);
      spawnGroup(game, id, 1, { elite: [chosen] });
      return `${ENEMIES[id].name} ${ELITE_MODIFIERS[chosen].name} invoquée`;
    },
  });
  commands.register('ult', {
    help: 'remplit l’énergie (Exécution prête)',
    run: () => {
      const p = game.world.req(game.player, 'player');
      p.energy = classDef(p.classId).maxEnergy;
      return 'Énergie au max';
    },
  });
  commands.register('status', {
    help: `status <${Object.keys(STATUSES).join('|')}> [ticks] — s'applique un statut`,
    run: ([id = '', ticks = '180']) => {
      if (!Object.hasOwn(STATUSES, id)) return `Statut inconnu : ${id}`;
      applyStatus(game, game.player, id as StatusId, Number(ticks) || 180);
      return `Statut ${id} appliqué`;
    },
  });
  commands.register('next', {
    help: 'passe à l’étage suivant',
    run: () => {
      if (!game.dungeon) return 'Pas en mode donjon';
      game.descend();
      return `Étage ${game.level}`;
    },
  });
  commands.register('floor', {
    help: 'floor <n> — relance la run à l’étage n (même seed)',
    run: ([n = '1']) => {
      newGame(game.seed, 'dungeon', Math.max(1, Number(n) || 1));
      return `Étage ${game.level}`;
    },
  });
  commands.register('reveal', {
    help: 'révèle la carte',
    run: () => {
      if (!game.dungeon) return 'Pas en mode donjon';
      revealAll(game.dungeon);
      return 'Carte révélée';
    },
  });
  commands.register('tp', {
    help: 'tp <start|combat|treasure|shop|altar|secret|miniboss|boss> — téléporte dans la salle',
    run: ([type = 'boss']) => {
      const room = game.dungeon?.floor.rooms.find((r) => r.type === type);
      if (!room) return `Aucune salle ${type}`;
      const c = game.map.tileCenter(room.center.tx, room.center.ty);
      const t = game.world.req(game.player, 'transform');
      t.x = t.prevX = c.x;
      t.y = t.prevY = c.y;
      camera.snapTo(c.x, c.y);
      return `Téléporté : ${type}`;
    },
  });
  commands.register('arena', {
    help: 'arène de test (vagues infinies)',
    run: () => (newGame(game.seed, 'arena'), 'Arène'),
  });
  commands.register('ko', {
    help: 'met le personnage actif KO (test du relais)',
    run: () => {
      const h = game.world.req(game.player, 'health');
      h.invuln = 0;
      h.shield = 0;
      dealDamage(game, game.player, {
        amount: 99999,
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
      return 'KO';
    },
  });
  commands.register('revive', {
    help: 'réanime les personnages KO',
    run: () => `${reviveAll(game, 1).length} réanimé(s)`,
  });
  commands.register('xp', {
    help: 'xp <n> — donne de l’XP au personnage actif',
    run: ([n = '200']) => {
      const party = game.world.req(game.player, 'party');
      const m = party.members[party.active];
      if (!m) return 'Aucun personnage';
      addXp(game, m, Math.max(0, Number(n) || 0));
      return `Niveau ${m.progress.level}, ${m.progress.pendingCards} choix en attente`;
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
      d.charges = classDef(game.world.req(game.player, 'player').classId).dash.maxCharges;
      return 'Dashs rechargés';
    },
  });
}
registerCommands();
void loadKeyLayout();

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
    skillPressed: input.consumePressed('skill'),
    ultimatePressed: input.consumePressed('ultimate'),
    secondaryHeld: input.isHeld('ranged'),
    interactPressed: input.consumePressed('interact'),
    switchTo: input.consumePressed('slot1')
      ? 0
      : input.consumePressed('slot2')
        ? 1
        : input.consumePressed('slot3')
          ? 2
          : -1,
    ui: progressPanel.takeAction() ?? comparePanel.takeAction() ?? altarPanel.takeAction(),
    useSlot: input.consumePressed('quick1') ? 0 : input.consumePressed('quick2') ? 1 : -1,
  };
}

function handleMetaKeys(): void {
  if (input.consumePressed('toggleDebug')) debug.toggle();
  if (input.consumePressed('toggleHitboxes')) debug.showHitboxes = !debug.showHitboxes;
  if (input.consumePressed('map')) minimap.expanded = !minimap.expanded;
  if (input.consumePressed('progress')) progressPanel.toggle(game);
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
      if (ev.type === 'floor') {
        const pt = game.world.req(game.player, 'transform');
        camera.snapTo(pt.x, pt.y);
      }
      // Design 1b: choices wait; a cleared room is a natural moment to offer them.
      if (ev.type === 'roomCleared' && !progressPanel.open) {
        const pending = game.world
          .req(game.player, 'party')
          .members.some((m) => m.progress.pendingCards > 0);
        if (pending) progressPanel.setOpen(true, game);
      }
      if (ev.type === 'altarOpen') altarPanel.show(ev.altar, ev.options);
      fx.handle(ev, camera);
      anim.onEvent(ev, game);
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
    anim.update(game, dt);
    camera.follow({ x: px, y: py }, camera.screenToWorld(input.mouseX, input.mouseY), dt);
    renderer.render(game, camera, fx, anim, alpha, dt, { showHitboxes: debug.showHitboxes });
    renderer.screenSpace();
    hud.draw(renderer.ctx, renderer.width, renderer.height, game, fx, dt);
    progressPanel.update(game);
    comparePanel.update(game);
    altarPanel.update(game);
    minimap.draw(renderer.ctx, renderer.width, renderer.height, game, performance.now() / 1000);

    debug.setLines([
      `FPS      ${fps.fps.toFixed(0)}`,
      `Tick     ${game.tick}${game.hitstopTicks > 0 ? '  (hit-stop)' : ''}`,
      `Entités  ${w.entityCount}`,
      `Seed     ${game.seed}`,
      `Joueur   ${t.x.toFixed(0)}, ${t.y.toFixed(0)}${game.godMode ? '  GOD' : ''}`,
      `Étage    ${game.level}${game.dungeon ? ` (essai ${game.dungeon.floor.attempt}, ${game.dungeon.floor.rooms.length} salles)` : ''}`,
      ``,
      `ZQSD/WASD bouger · clic G/D attaques · Espace mobilité · 1/2/3 switch`,
      `A (AZERTY)/Q compétence · R ultime · E interagir · Tab carte · M son`,
    ]);
  },
});
