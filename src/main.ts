import { Sfx } from './audio/sfx';
import { FixedStepClock, FpsCounter, runLoop } from './core/loop';
import { lerp, normalize } from './core/math';
import { normalizeSeed, seedFromNumber } from './core/rng';
import { classDef, isClassId, type ClassId } from './data/classes';
import { NO_BONUSES } from './data/meta';
import { TEAM } from './data/team';
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
import { GamepadInput } from './input/gamepad';
import type { Action } from './data/controls';
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
import { Menus } from './ui/menus';
import { Hints } from './ui/hints';
import { TutorialPanel } from './ui/tutorialPanel';
import { Music } from './audio/music';
import { TUTORIAL_PARTY } from './data/tutorial';
import { browserStore, SaveManager } from './save/save';
import {
  allRelics,
  buy,
  dailyChallenge,
  recordRun,
  relicPool,
  runBonuses,
  type RunRecord,
} from './save/meta';
import { UNLOCKS } from './data/meta';
import type { GameOptions } from './game/game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');

function randomSeed(): string {
  // The only non-deterministic draw in the game: choosing a fresh seed.
  return seedFromNumber(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0);
}

/** Local date (YYYY-MM-DD): the daily challenge follows the player's calendar day. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const clock = new FixedStepClock(ENGINE.tickRate, ENGINE.maxStepsPerFrame);
const fps = new FpsCounter();
const renderer = new Renderer(canvas);
const camera = new Camera();
const kbm = new KeyboardMouse(canvas);
const pad = new GamepadInput();
/** Keyboard/mouse and gamepad merged behind one interface. */
const input = {
  get suspended(): boolean {
    return kbm.suspended;
  },
  set suspended(v: boolean) {
    kbm.suspended = v;
  },
  get mouseX(): number {
    return kbm.mouseX;
  },
  get mouseY(): number {
    return kbm.mouseY;
  },
  isHeld: (a: Action): boolean => kbm.isHeld(a) || (!kbm.suspended && pad.isHeld(a)),
  consumePressed: (a: Action): boolean => {
    const k = kbm.consumePressed(a);
    const p = pad.consumePressed(a);
    return k || (p && !kbm.suspended);
  },
  clearEdges: (): void => {
    kbm.clearEdges();
    pad.clearEdges();
  },
};
/** Aim mode: the right stick took over until the mouse moves again. */
let padAim = false;
let padDir = { x: 1, y: 0 };
let lastMouse = { x: -1, y: -1 };

/** World point the player aims at (cursor, or right stick around the player). */
function aimWorld(): { x: number; y: number } {
  if (pad.aiming) {
    padAim = true;
    padDir = { x: pad.aimX, y: pad.aimY };
  } else if (pad.connected && padAim && (pad.moveX !== 0 || pad.moveY !== 0)) {
    padDir = normalize(pad.moveX, pad.moveY);
  }
  if (kbm.mouseX !== lastMouse.x || kbm.mouseY !== lastMouse.y) {
    if (lastMouse.x >= 0) padAim = false;
    lastMouse = { x: kbm.mouseX, y: kbm.mouseY };
  }
  if (padAim && game) {
    const t = game.world.req(game.player, 'transform');
    return { x: t.x + padDir.x * 240, y: t.y + padDir.y * 240 };
  }
  return camera.screenToWorld(kbm.mouseX, kbm.mouseY);
}

/** D-pad / A / B drive the DOM menus. */
function padMenus(): void {
  if (!pad.connected || !menus.open) return;
  const buttons = Array.from(
    uiRoot?.querySelectorAll<HTMLButtonElement>('.menus button:not([disabled])') ?? [],
  );
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const move = (d: number): void => {
    const next = buttons[(i + d + buttons.length) % buttons.length] ?? buttons[0];
    next?.focus();
  };
  if (pad.consumeButton(13) || pad.consumeButton(15)) move(1);
  if (pad.consumeButton(12) || pad.consumeButton(14)) move(-1);
  if (pad.consumeButton(0)) (buttons[i] ?? buttons[0])?.click();
  if (pad.consumeButton(1) || pad.consumeButton(9))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
}
const sfx = new Sfx();
const hud = new Hud();
const minimap = new Minimap();
const saves = new SaveManager(browserStore());
const music = new Music(() => sfx.context);
if (saves.data.settings.muted) sfx.toggleMute();

function applySettings(): void {
  const s = saves.data.settings;
  sfx.setVolume(s.sfxVolume);
  music.setVolume(s.musicVolume);
  music.setMuted(sfx.muted);
  camera.shakeScale = s.shake ? 1 : 0;
}
const progressPanel = new ProgressPanel(uiRoot);
const comparePanel = new ComparePanel(uiRoot);
const altarPanel = new AltarPanel(uiRoot);
let anim = new Animator();
const commands = new CommandRegistry();
const debug = new DebugOverlay(uiRoot, commands);
let fx = new Effects();

/** Current run. Null on the title screen. */
let game: Game | null = null;
let team: ClassId[] = [...TEAM.defaultParty];
/** The run's rewards were banked (death, abandon, finished victory): nothing more to save. */
let runEnded = false;

const menus: Menus = new Menus(uiRoot, {
  save: () => saves.data,
  today,
  continueRun: () => {
    const snap = saves.data.run;
    if (!snap) return;
    launch(snap.seed, { restore: snap });
  },
  startRun: (picked, seed) => {
    abandonSaved();
    team = picked;
    launch(seed ? normalizeSeed(seed) : randomSeed(), {
      party: picked,
      bonuses: runBonuses(saves.data.meta),
      relicPool: relicPool(saves.data.meta),
      difficulty: saves.data.settings.difficulty,
    });
  },
  startDaily: () => {
    abandonSaved();
    const d = dailyChallenge(today());
    team = d.team;
    // Fair for everyone: no permanent upgrades, every relic can drop.
    // The daily challenge is always played in "Difficile".
    launch(d.seed, {
      party: d.team,
      daily: true,
      bonuses: NO_BONUSES,
      relicPool: allRelics(),
      difficulty: 'hard',
    });
  },
  buy: (p) => {
    if (buy(saves.data.meta, p)) saves.write();
  },
  resume: () => menus.hide(),
  quitToTitle: () => toTitle(),
  abandon: () => endRun('abandon'),
  finishVictory: () => endRun('victory'),
  newRunSameTeam: (sameSeed) => {
    const g = game;
    if (g?.daily) return menus.current === 'end' ? menus.show('title') : undefined;
    menus.hide();
    const allowed = team.filter(isClassId);
    launch(sameSeed && g ? g.seed : randomSeed(), {
      party: allowed,
      bonuses: runBonuses(saves.data.meta),
      relicPool: relicPool(saves.data.meta),
      difficulty: saves.data.settings.difficulty,
    });
  },
  wipeSave: () => {
    saves.reset();
    if (saves.data.settings.muted !== sfx.muted) sfx.toggleMute();
    applySettings();
  },
  startTutorial: () => {
    launch('ENTRAINEMENT', { party: TUTORIAL_PARTY, tutorial: true }, 'arena');
  },
  inTutorial: () => game?.tutorial != null,
  setSetting: (key, value) => {
    saves.data.settings[key] = value;
    saves.write();
    applySettings();
  },
});
const hints = new Hints(uiRoot, saves);
const tutorialPanel = new TutorialPanel(uiRoot, {
  skip: () => {
    saves.data.settings.tutorialDone = true;
    saves.write();
    toTitle();
  },
  play: () => {
    toTitle();
    menus.show('team');
  },
  title: () => toTitle(),
});
applySettings();

function launch(seed: string, opts: GameOptions, mode: 'dungeon' | 'arena' = 'dungeon'): Game {
  if (game) progressPanel.setOpen(false, game);
  const g = new Game(normalizeSeed(seed), clock.stepSeconds, { ...opts, mode });
  team = g.world.req(g.player, 'party').members.map((m) => m.classId);
  const t = g.world.req(g.player, 'transform');
  camera.snapTo(t.x, t.y);
  fx = new Effects();
  anim = new Animator();
  game = g;
  runEnded = mode === 'arena';
  menus.hide();
  persistRun();
  return g;
}

/** Writes the floor-start snapshot (design 2b: resume at the start of the floor). */
function persistRun(): void {
  if (!game || runEnded || !game.floorSnapshot) return;
  saves.data.run = game.floorSnapshot;
  saves.write();
}

/** Starting over while a run is saved banks it as abandoned (its progress still pays). */
function abandonSaved(): void {
  const snap = saves.data.run;
  if (!snap) return;
  recordRun(saves.data.meta, saves.data.history, {
    seed: snap.seed,
    daily: snap.daily,
    date: today(),
    team: snap.members.map((m) => m.classId),
    stats: snap.stats,
    outcome: 'abandon',
    difficulty: snap.difficulty ?? 'normal',
  });
  saves.data.run = null;
  saves.write();
}

function endRun(outcome: RunRecord['outcome']): void {
  const g = game;
  if (!g || runEnded) return;
  runEnded = true;
  const record = recordRun(saves.data.meta, saves.data.history, {
    seed: g.seed,
    daily: g.daily,
    date: today(),
    team: g.world.req(g.player, 'party').members.map((m) => m.classId),
    stats: g.stats,
    outcome,
    difficulty: g.difficulty,
  });
  saves.data.run = null;
  saves.write();
  menus.showEnd({ record, stats: { ...g.stats } });
}

function toTitle(): void {
  if (game) progressPanel.setOpen(false, game);
  hints.clear();
  game = null;
  menus.show('title');
}

/** Case-insensitive lookup so "bonearcher" works in the console. */
function resolveEnemyId(raw: string): EnemyId | null {
  const id = Object.keys(ENEMIES).find((k) => k.toLowerCase() === raw.toLowerCase());
  return id && isEnemyId(id) ? id : null;
}

/** Debug runs reuse the current team and meta. */
function newGame(seed: string, mode: 'dungeon' | 'arena' = 'dungeon', startLevel = 1): Game {
  return launch(
    seed,
    {
      party: team,
      startLevel,
      bonuses: runBonuses(saves.data.meta),
      relicPool: relicPool(saves.data.meta),
      difficulty: game?.difficulty ?? saves.data.settings.difficulty,
    },
    mode,
  );
}

function registerCommands(): void {
  /** Commands that need a run in progress. */
  const reg = (name: string, help: string, run: (g: Game, args: string[]) => string): void =>
    commands.register(name, {
      help,
      run: (args) => (game ? run(game, args) : 'Pas de run en cours'),
    });

  reg('seed', 'seed [valeur] — affiche le seed, ou relance avec un nouveau', (g, [value]) => {
    if (!value) return `Seed : ${g.seed}`;
    return `Nouvelle partie, seed ${newGame(value).seed}`;
  });
  reg('restart', 'relance avec le même seed', (g) => `Relancé (seed ${newGame(g.seed).seed})`);
  reg('heal', 'soigne complètement', (g) => {
    const h = g.world.req(g.player, 'health');
    h.hp = h.max;
    return 'PV restaurés';
  });
  reg(
    'god',
    'invincibilité on/off',
    (g) => ((g.godMode = !g.godMode), `God mode ${g.godMode ? 'ON' : 'OFF'}`),
  );
  reg('spawn', `spawn <${Object.keys(ENEMIES).join('|')}> [n]`, (g, [raw = 'ghoul', n = '1']) => {
    const id = resolveEnemyId(raw);
    if (!id) return `Ennemi inconnu : ${raw}`;
    return `${spawnGroup(g, id, Math.max(1, Number(n) || 1))} ${ENEMIES[id].name}(s) invoquée(s)`;
  });
  reg(
    'elite',
    `elite <ennemi> [${Object.keys(ELITE_MODIFIERS).join('|')}] — invoque une élite`,
    (g, [raw = 'ghoul', mod]) => {
      const id = resolveEnemyId(raw);
      if (!id) return `Ennemi inconnu : ${raw}`;
      const mods = Object.keys(ELITE_MODIFIERS) as EliteModifierId[];
      const chosen =
        mod && (mods as string[]).includes(mod) ? (mod as EliteModifierId) : g.rng.spawn.pick(mods);
      spawnGroup(g, id, 1, { elite: [chosen] });
      return `${ENEMIES[id].name} ${ELITE_MODIFIERS[chosen].name} invoquée`;
    },
  );
  reg('ult', 'remplit l’énergie (ultime prêt)', (g) => {
    const p = g.world.req(g.player, 'player');
    p.energy = classDef(p.classId).maxEnergy;
    return 'Énergie au max';
  });
  reg(
    'status',
    `status <${Object.keys(STATUSES).join('|')}> [ticks] — s'applique un statut`,
    (g, [id = '', ticks = '180']) => {
      if (!Object.hasOwn(STATUSES, id)) return `Statut inconnu : ${id}`;
      applyStatus(g, g.player, id as StatusId, Number(ticks) || 180);
      return `Statut ${id} appliqué`;
    },
  );
  reg('next', 'passe à l’étage suivant', (g) => {
    if (!g.dungeon) return 'Pas en mode donjon';
    g.descend();
    return `Étage ${g.level}`;
  });
  reg('floor', 'floor <n> — relance la run à l’étage n (même seed)', (g, [n = '1']) => {
    return `Étage ${newGame(g.seed, 'dungeon', Math.max(1, Number(n) || 1)).level}`;
  });
  reg('reveal', 'révèle la carte', (g) => {
    if (!g.dungeon) return 'Pas en mode donjon';
    revealAll(g.dungeon);
    return 'Carte révélée';
  });
  reg(
    'tp',
    'tp <start|combat|treasure|shop|altar|secret|miniboss|boss> — téléporte dans la salle',
    (g, [type = 'boss']) => {
      const room = g.dungeon?.floor.rooms.find((r) => r.type === type);
      if (!room) return `Aucune salle ${type}`;
      const c = g.map.tileCenter(room.center.tx, room.center.ty);
      const t = g.world.req(g.player, 'transform');
      t.x = t.prevX = c.x;
      t.y = t.prevY = c.y;
      camera.snapTo(c.x, c.y);
      return `Téléporté : ${type}`;
    },
  );
  commands.register('arena', {
    help: 'arène de test (vagues infinies)',
    run: () => (newGame(game?.seed ?? randomSeed(), 'arena'), 'Arène'),
  });
  reg('ko', 'met le personnage actif KO (test du relais)', (g) => {
    const h = g.world.req(g.player, 'health');
    h.invuln = 0;
    h.shield = 0;
    dealDamage(g, g.player, {
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
  });
  reg('revive', 'réanime les personnages KO', (g) => `${reviveAll(g, 1).length} réanimé(s)`);
  reg('xp', 'xp <n> — donne de l’XP au personnage actif', (g, [n = '200']) => {
    const party = g.world.req(g.player, 'party');
    const m = party.members[party.active];
    if (!m) return 'Aucun personnage';
    addXp(g, m, Math.max(0, Number(n) || 0));
    return `Niveau ${m.progress.level}, ${m.progress.pendingCards} choix en attente`;
  });
  reg('killall', 'détruit tous les ennemis', (g) => {
    const enemies = g.world.query('enemy');
    for (const [e] of enemies) g.world.destroy(e);
    return `${enemies.length} ennemi(s) détruit(s)`;
  });
  reg('dash', 'recharge les dashs', (g) => {
    const d = g.world.req(g.player, 'dash');
    d.charges = classDef(g.world.req(g.player, 'player').classId).dash.maxCharges;
    return 'Dashs rechargés';
  });
  commands.register('shards', {
    help: 'shards <n> — ajoute des Éclats (méta)',
    run: ([n = '100']) => {
      saves.data.meta.shards += Math.max(0, Number(n) || 0);
      saves.write();
      return `${saves.data.meta.shards} Éclats`;
    },
  });
  commands.register('unlockall', {
    help: 'débloque classes et reliquaires',
    run: () => {
      saves.data.meta.unlocked = UNLOCKS.map((u) => u.id);
      saves.write();
      return 'Tout est débloqué';
    },
  });
}
registerCommands();
void loadKeyLayout();

function sampleInput(): InputFrame {
  const keys = normalize(
    (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0),
    (input.isHeld('down') ? 1 : 0) - (input.isHeld('up') ? 1 : 0),
  );
  // Analog stick when the keyboard is idle.
  const dir = keys.x === 0 && keys.y === 0 ? { x: pad.moveX, y: pad.moveY } : keys;
  const aim = aimWorld();
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

function handleMetaKeys(g: Game | null): void {
  if (input.consumePressed('toggleDebug')) debug.toggle();
  if (input.consumePressed('toggleHitboxes')) debug.showHitboxes = !debug.showHitboxes;
  if (input.consumePressed('mute')) {
    saves.data.settings.muted = sfx.toggleMute();
    saves.write();
    music.setMuted(sfx.muted);
    debug.print(sfx.muted ? 'Son coupé' : 'Son activé');
  }
  // Menus and the console take the keyboard (seed field, Escape…).
  input.suspended = debug.consoleOpen || menus.pausesGame;
  if (!g || input.suspended) return;
  if (input.consumePressed('map')) minimap.expanded = !minimap.expanded;
  if (input.consumePressed('progress')) progressPanel.toggle(g);
  if (input.consumePressed('pause') && g.playerAlive && !runEnded) menus.show('pause');
  // Arena (debug) runs aren't recorded: restart straight away.
  if (!g.playerAlive && g.mode === 'arena' && !g.tutorial) {
    if (input.consumePressed('confirm')) newGame(g.seed, 'arena');
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
    pad.poll();
    padMenus();
    handleMetaKeys(game);
    const g = game;
    if (!g || menus.pausesGame) {
      input.clearEdges();
      return;
    }
    const aim = aimWorld();
    g.step(input.suspended ? { ...emptyInput(), aimX: aim.x, aimY: aim.y } : sampleInput());
  },
  render(alpha, frameMs) {
    handleMetaKeys(game);
    const g = game;
    const dt = Math.min(frameMs, 100) / 1000;
    fps.frame(frameMs);
    debug.setFps(fps.fps);
    hints.update(g, dt, menus.pausesGame, progressPanel.open);
    tutorialPanel.update(g);
    music.play(!g || menus.current === 'title' ? 'title' : g.biome);
    if (!g) {
      renderer.screenSpace();
      renderer.ctx.fillStyle = '#07060b';
      renderer.ctx.fillRect(0, 0, renderer.width, renderer.height);
      return;
    }
    for (const ev of g.drainEvents()) {
      if (ev.type === 'floor') {
        const pt = g.world.req(g.player, 'transform');
        camera.snapTo(pt.x, pt.y);
        persistRun();
      }
      // Design 1b: choices wait; a cleared room is a natural moment to offer them.
      if (ev.type === 'roomCleared' && !progressPanel.open) {
        const pending = g.world
          .req(g.player, 'party')
          .members.some((m) => m.progress.pendingCards > 0);
        if (pending) progressPanel.setOpen(true, g);
      }
      if (ev.type === 'altarOpen') altarPanel.show(ev.altar, ev.options);
      if (ev.type === 'victory' && !runEnded) menus.show('victory');
      if (ev.type === 'playerDeath' && g.mode === 'dungeon') endRun('death');
      if (ev.type === 'doorsLocked') music.setIntensity(1);
      if (ev.type === 'roomCleared' || ev.type === 'floor') music.setIntensity(0);
      if (ev.type === 'tutorialDone') {
        saves.data.settings.tutorialDone = true;
        saves.write();
      }
      if (!g.tutorial) hints.onEvent(ev);
      fx.handle(ev, camera);
      anim.onEvent(ev, g);
      sfx.onEvent(ev);
    }
    if (game !== g) return;

    const w = g.world;
    const t = w.req(g.player, 'transform');
    const px = lerp(t.prevX, t.x, alpha);
    const py = lerp(t.prevY, t.y, alpha);
    // Dash afterimages, emitted at a fixed rate regardless of FPS.
    ghostTimer -= dt;
    if (w.req(g.player, 'dash').active > 0 && ghostTimer <= 0) {
      fx.addGhost(px, py, w.req(g.player, 'facing').angle);
      ghostTimer = 0.016;
    }

    // Paused: the world stays frozen behind the menu.
    const frozen = menus.pausesGame;
    const fdt = frozen ? 0 : dt;
    fx.update(fdt);
    anim.update(g, fdt);
    camera.follow({ x: px, y: py }, aimWorld(), fdt);
    renderer.render(g, camera, fx, anim, alpha, fdt, {
      showHitboxes: debug.showHitboxes,
      lighting: saves.data.settings.lighting,
    });
    renderer.screenSpace();
    hud.draw(renderer.ctx, renderer.width, renderer.height, g, fx, fdt);
    progressPanel.update(g);
    comparePanel.update(g);
    altarPanel.update(g);
    minimap.draw(renderer.ctx, renderer.width, renderer.height, g, performance.now() / 1000);

    debug.setLines([
      `FPS      ${fps.fps.toFixed(0)}`,
      `Tick     ${g.tick}${g.hitstopTicks > 0 ? '  (hit-stop)' : ''}`,
      `Entités  ${w.entityCount}`,
      `Seed     ${g.seed}${g.daily ? '  (défi du jour)' : ''}`,
      `Joueur   ${t.x.toFixed(0)}, ${t.y.toFixed(0)}${g.godMode ? '  GOD' : ''}`,
      `Étage    ${g.level}${g.dungeon ? ` (essai ${g.dungeon.floor.attempt}, ${g.dungeon.floor.rooms.length} salles)` : ''}`,
      ``,
      `ZQSD/WASD bouger · clic G/D attaques · Espace mobilité · 1/2/3 switch`,
      `A (AZERTY)/Q compétence · R ultime · E interagir · Tab carte · Échap pause`,
    ]);
  },
});

// Entry point: ?seed=XYZ jumps straight into a run (handy for sharing seeds), else the title.
const urlSeed = new URLSearchParams(location.search).get('seed');
if (urlSeed) {
  const last = saves.data.history.find((r) => !r.daily)?.team;
  if (last) team = last;
  newGame(urlSeed);
} else {
  menus.setNotice(saves.notice);
  menus.show('title');
}
