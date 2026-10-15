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
}

export function emptyInput(): InputFrame {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
}
