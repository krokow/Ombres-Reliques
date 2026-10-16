import { CLASSES } from '../data/classes';
import { DUMMY_STUN_TICKS, TUTORIAL, type TutorialStep } from '../data/tutorial';
import { spawnEnemy } from '../game/factories';
import type { GameEvent } from '../game/events';
import type { Sim } from '../game/sim';
import { applyStatus } from './statuses';

/** Progress through the guided training room. */
export interface TutorialState {
  step: number;
  progress: number;
  /** Last player position, for the movement goal. */
  lastX: number;
  lastY: number;
  done: boolean;
  /** Set once the current step's setup (spawns) has run. */
  started: boolean;
}

export function createTutorial(): TutorialState {
  return { step: 0, progress: 0, lastX: 0, lastY: 0, done: false, started: false };
}

export function tutorialStep(state: TutorialState): TutorialStep | undefined {
  return TUTORIAL[state.step];
}

export function goalCount(step: TutorialStep): number {
  return step.goal.kind === 'move' ? step.goal.distance : step.goal.count;
}

function startStep(sim: Sim, state: TutorialState, step: TutorialStep): void {
  const w = sim.world;
  // Leftovers from the previous step would muddle the new goal.
  for (const [e] of w.query('enemy')) w.destroy(e);
  const pt = w.req(sim.player, 'transform');
  state.lastX = pt.x;
  state.lastY = pt.y;
  for (const s of step.spawn ?? []) {
    let x = pt.x + s.dx;
    let y = pt.y + s.dy;
    if (sim.map.isSolidAt(x, y)) {
      x = pt.x + s.dx * 0.5;
      y = pt.y;
    }
    const e = spawnEnemy(sim, s.enemy, x, y, { alert: !s.dummy });
    if (s.dummy) {
      applyStatus(sim, e, 'stun', DUMMY_STUN_TICKS);
      // Back turned to the player: the backstab lesson needs walking around it.
      w.req(e, 'facing').angle = Math.atan2(y - pt.y, x - pt.x);
    }
  }
  if (step.fillEnergy) {
    for (const m of w.req(sim.player, 'party').members)
      m.state.energy = CLASSES[m.classId].maxEnergy;
  }
  state.started = true;
  sim.events.push({ type: 'tutorialStep', step: state.step });
}

function countsFor(step: TutorialStep, ev: GameEvent): number {
  const g = step.goal;
  switch (g.kind) {
    case 'move':
      return 0;
    case 'kills':
      return ev.type === 'kill' && ev.byPlayer ? 1 : 0;
    case 'backstab':
      return ev.type === 'hit' && ev.backstab ? 1 : 0;
    case 'event':
      return (g.events as readonly string[]).includes(ev.type) ? 1 : 0;
  }
}

/** Advances the training room from this tick's events. */
export function updateTutorial(sim: Sim, state: TutorialState, events: readonly GameEvent[]): void {
  if (state.done) return;
  const step = tutorialStep(state);
  if (!step) {
    state.done = true;
    return;
  }
  if (!state.started) {
    startStep(sim, state, step);
    return;
  }
  if (step.goal.kind === 'move') {
    const pt = sim.world.req(sim.player, 'transform');
    state.progress += Math.hypot(pt.x - state.lastX, pt.y - state.lastY);
    state.lastX = pt.x;
    state.lastY = pt.y;
  } else {
    for (const ev of events) state.progress += countsFor(step, ev);
  }
  if (state.progress < goalCount(step)) return;
  state.step++;
  state.progress = 0;
  state.started = false;
  // Heal between lessons: the room is for learning, not for dying.
  for (const m of sim.world.req(sim.player, 'party').members) {
    m.ko = false;
    m.health.hp = m.health.max;
  }
  if (state.step >= TUTORIAL.length) {
    state.done = true;
    for (const [e] of sim.world.query('enemy')) sim.world.destroy(e);
    sim.events.push({ type: 'tutorialDone' });
  }
}
