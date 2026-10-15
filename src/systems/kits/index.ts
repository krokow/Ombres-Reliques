import type { ClassId } from '../../data/classes';
import { arcanistKit } from './arcanist';
import { guardianKit } from './guardian';
import type { Kit } from './kit';
import { shadowBladeKit } from './shadowBlade';

/**
 * Kit lookup. A function (not a table built at import time) because kits and
 * the damage/team systems import each other: resolving at call time keeps the
 * module cycle harmless.
 */
export function kitFor(id: ClassId): Kit {
  switch (id) {
    case 'shadowBlade':
      return shadowBladeKit;
    case 'guardian':
      return guardianKit;
    case 'arcanist':
      return arcanistKit;
  }
}

export type { Kit, SlotInfo } from './kit';
