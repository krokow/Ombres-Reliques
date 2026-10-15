import { enemyDef } from '../../data/enemies';
import type { Sim } from '../../game/sim';
import { isStunned } from '../statuses';
import { kamikazeBehavior, meleeBehavior, rangedBehavior, summonerBehavior } from './behaviors';
import { halt, perceive, setPhase, type Neighbor } from './context';

/** Runs every enemy's state machine. Order: timers → stagger/stun → perception → behaviour. */
export function enemyAI(sim: Sim): void {
  const w = sim.world;
  const neighbors: Neighbor[] = w
    .query('enemy', 'transform', 'body')
    .map(([e, , t, b]) => ({ e, t, b }));

  for (const [e, ai, t, v, facing, health, mover, body] of w.query(
    'enemy',
    'transform',
    'velocity',
    'facing',
    'health',
    'mover',
    'body',
  )) {
    if (w.isPendingDestroy(e)) continue;
    const def = enemyDef(ai.defId);
    ai.phaseTicks++;
    if (ai.cooldown > 0) ai.cooldown--;
    if (ai.repath > 0) ai.repath--;
    const staggered = health.stagger > 0 || isStunned(w, e);
    if (health.stagger > 0) health.stagger--;

    const ctx = perceive({
      sim,
      e,
      def,
      ai,
      t,
      v,
      facing,
      mover,
      body,
      speedMult: ai.speedMult,
      damageMult: ai.damageMult,
      staggered,
      neighbors,
    });

    // Staggers interrupt telegraphed attacks, but a lit fuse keeps burning.
    if (staggered && ai.phase !== 'fuse') {
      halt(ctx);
      if (ai.phase === 'windup' || ai.phase === 'channel') setPhase(ai, 'recover');
      continue;
    }

    switch (def.behavior) {
      case 'melee':
        meleeBehavior(ctx, def);
        break;
      case 'ranged':
        rangedBehavior(ctx, def);
        break;
      case 'kamikaze':
        kamikazeBehavior(ctx, def);
        break;
      case 'summoner':
        summonerBehavior(ctx, def);
        break;
    }
  }
}
