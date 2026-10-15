import type { Entity } from '../ecs/world';
import type { Sim } from '../game/sim';
import { equipItem, salvageItem, useAltar, type AltarOption } from './loot';
import { applyProgressAction, type ProgressAction } from './progression';

/**
 * Every command coming from a UI panel. They travel through the InputFrame
 * (never applied directly by the UI), so a run is fully replayable.
 */
export type UiAction =
  | ProgressAction
  | { kind: 'equip'; item: Entity; member: number }
  | { kind: 'salvage'; item: Entity }
  | { kind: 'altar'; option: AltarOption };

export function applyUiAction(sim: Sim, action: UiAction): boolean {
  switch (action.kind) {
    case 'card':
    case 'talent':
      return applyProgressAction(sim, action);
    case 'equip':
      return equipItem(sim, action.item, action.member);
    case 'salvage':
      return salvageItem(sim, action.item);
    case 'altar':
      return useAltar(sim, action.option);
  }
}
