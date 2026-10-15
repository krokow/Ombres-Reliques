import type { UiAction } from '../systems/actions';

/**
 * Device-agnostic input snapshot fed to the simulation once per fixed step.
 * The sim never touches the DOM: keyboard, mouse or gamepad all produce this.
 */
export interface InputFrame {
  /** Movement direction, length <= 1. */
  moveX: number;
  moveY: number;
  /** Aim point in world coordinates. */
  aimX: number;
  aimY: number;
  /** Held state: holding attack keeps the combo going. */
  attackHeld: boolean;
  /** Edge-triggered presses (true for exactly one tick). */
  attackPressed: boolean;
  rangedPressed: boolean;
  dashPressed: boolean;
  skillPressed: boolean;
  ultimatePressed: boolean;
  /** Secondary button held (Guardian's shield). */
  secondaryHeld: boolean;
  interactPressed: boolean;
  /** Party slot requested this tick (0-2), or -1. */
  switchTo: number;
  /** Command issued by a UI panel this tick (card, talent, equip, altar…). */
  ui: UiAction | null;
  /** Quick consumable slot used this tick (0-1), or -1. */
  useSlot: number;
}

export function emptyInput(): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    attackHeld: false,
    attackPressed: false,
    rangedPressed: false,
    dashPressed: false,
    skillPressed: false,
    ultimatePressed: false,
    secondaryHeld: false,
    interactPressed: false,
    switchTo: -1,
    ui: null,
    useSlot: -1,
  };
}
