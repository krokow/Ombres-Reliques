import { enemyDef } from '../data/enemies';
import type { GameWorld } from '../ecs/components';
import type { Entity } from '../ecs/world';

/** Burrowed enemies can't be hit or targeted by anything (area damage included). */
export function isUntargetable(w: GameWorld, e: Entity): boolean {
  const ai = w.get(e, 'enemy');
  if (!ai) return false;
  return (
    enemyDef(ai.defId).behavior === 'burrower' && (ai.phase === 'channel' || ai.phase === 'windup')
  );
}
