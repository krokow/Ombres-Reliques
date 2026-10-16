import { describe, expect, it } from 'vitest';
import { TUTORIAL, TUTORIAL_PARTY } from '../src/data/tutorial';
import { Game } from '../src/game/game';
import type { GameEvent } from '../src/game/events';
import { dealDamage } from '../src/systems/damage';
import { hasStatus } from '../src/systems/statuses';
import { goalCount, tutorialStep, updateTutorial } from '../src/systems/tutorial';
import { DT, run, runCollect } from './helpers';

const training = (): Game =>
  new Game('ENTRAINEMENT', DT, { tutorial: true, party: TUTORIAL_PARTY });

/** Fake event satisfying the current step's goal. */
function goalEvent(game: Game): GameEvent {
  const step = tutorialStep(game.tutorial!)!;
  const g = step.goal;
  if (g.kind === 'kills')
    return { type: 'kill', target: 0, kind: 'ghoul', x: 0, y: 0, byPlayer: true, elite: false };
  if (g.kind === 'backstab')
    return {
      type: 'hit',
      target: 0,
      x: 0,
      y: 0,
      damage: 1,
      crit: true,
      backstab: true,
      dirX: 0,
      dirY: 0,
      byPlayer: true,
      dot: false,
      absorbed: 0,
      ally: false,
      fromAlly: false,
    };
  if (g.kind === 'event') return { type: g.events[0]!, x: 0, y: 0 } as GameEvent;
  throw new Error('move goal');
}

describe('Entraînement', () => {
  it('runs in the arena without waves', () => {
    const game = training();
    expect(game.mode).toBe('arena');
    run(game, 300);
    expect(game.world.query('enemy')).toHaveLength(0);
  });

  it('the first step completes by walking', () => {
    const game = training();
    const events = runCollect(game, 200, { moveX: 1 });
    run(game, 200, { moveX: -1 });
    events.push(...game.drainEvents());
    expect(game.tutorial!.step).toBeGreaterThanOrEqual(1);
    expect(events.filter((e) => e.type === 'tutorialStep').length).toBeGreaterThanOrEqual(2);
  });

  it('dummies are stunned and turn their back to the player', () => {
    const game = training();
    game.tutorial!.step = TUTORIAL.findIndex((s) => s.goal.kind === 'backstab');
    run(game, 2);
    const [e, , t, f] = game.world.query('enemy', 'transform', 'facing')[0]!;
    const pt = game.world.req(game.player, 'transform');
    expect(hasStatus(game.world, e, 'stun')).toBe(true);
    expect(Math.cos(f.angle - Math.atan2(t.y - pt.y, t.x - pt.x))).toBeCloseTo(1);
  });

  it('the party cannot die in the training room', () => {
    const game = training();
    const h = game.world.req(game.player, 'health');
    h.invuln = 0;
    dealDamage(game, game.player, {
      amount: 9999,
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
    expect(h.hp).toBe(1);
    expect(game.playerAlive).toBe(true);
  });

  it('every step can be completed, and the end is announced', () => {
    const game = training();
    const t = game.tutorial!;
    const out: GameEvent[] = [];
    let guard = 0;
    while (!t.done && guard++ < 500) {
      updateTutorial(game, t, []); // starts the step
      const step = tutorialStep(t);
      if (!step) break;
      if (step.goal.kind === 'move') t.progress = goalCount(step);
      else for (let i = 0; i < goalCount(step); i++) updateTutorial(game, t, [goalEvent(game)]);
      updateTutorial(game, t, []);
      out.push(...game.drainEvents());
    }
    expect(t.done).toBe(true);
    expect(out.some((e) => e.type === 'tutorialDone')).toBe(true);
    expect(out.filter((e) => e.type === 'tutorialStep')).toHaveLength(TUTORIAL.length);
  });
});
