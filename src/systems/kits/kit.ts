import type { Action } from '../../data/controls';
import type { InputFrame } from '../../game/inputFrame';
import type { Sim } from '../../game/sim';

/** One HUD skill slot. */
export interface SlotInfo {
  key: Action;
  label: string;
  /** 0..1 readiness (cooldown / resource). */
  fill: number;
  ready: boolean;
  color: string;
  count?: string;
}

/**
 * A class kit: the five actions, passive and switch-in effect of one class.
 * Generic movement, buffering and team logic stay outside; kits only decide
 * what the buttons do.
 */
export interface Kit {
  /** Runs each tick for the active character while it is in control. */
  update(sim: Sim, input: InputFrame): void;
  /** True while an ability owns the character (no movement, no switching). */
  busy(sim: Sim): boolean;
  /** Runs instead of `update` while busy. */
  updateBusy(sim: Sim, input: InputFrame): void;
  /** Current movement speed factor (attacking, blocking…). */
  moveFactor(sim: Sim): number;
  /** Switch-in effect. */
  entry(sim: Sim): void;
  hud(sim: Sim): SlotInfo[];
}
