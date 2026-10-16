import type { Action } from '../data/controls';

/**
 * Standard-mapping gamepad (Gamepad API, polled once per frame).
 * Buttons are mapped to the same actions as the keyboard; presses are
 * edge-detected and buffered until consumed, like KeyboardMouse.
 */
export const PAD_BINDINGS: Partial<Record<Action, readonly number[]>> = {
  attack: [7], // RT
  ranged: [6], // LT (held = guard / pressed = secondary)
  dash: [0], // A
  interact: [1], // B
  skill: [2], // X
  ultimate: [3], // Y
  quick1: [4], // LB
  quick2: [5], // RB
  slot1: [14], // D-pad left
  slot2: [12], // D-pad up
  slot3: [15], // D-pad right
  progress: [13], // D-pad down
  map: [8], // Back / Select
  pause: [9], // Start
  confirm: [0, 9],
};

const DEADZONE = 0.22;

export class GamepadInput {
  connected = false;
  moveX = 0;
  moveY = 0;
  aimX = 0;
  aimY = 0;
  /** The right stick is being used (aim follows it instead of the mouse). */
  aiming = false;
  private down = new Set<number>();
  private pressed = new Set<number>();

  poll(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p?.connected) ?? null;
    this.connected = pad !== null;
    if (!pad) {
      this.down.clear();
      this.moveX = this.moveY = 0;
      this.aiming = false;
      return;
    }
    const stick = (x: number, y: number): [number, number] => {
      const m = Math.hypot(x, y);
      if (m < DEADZONE) return [0, 0];
      const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
      return [x * k, y * k];
    };
    [this.moveX, this.moveY] = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const [ax, ay] = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    this.aiming = ax !== 0 || ay !== 0;
    if (this.aiming) {
      const m = Math.hypot(ax, ay);
      this.aimX = ax / m;
      this.aimY = ay / m;
    }
    pad.buttons.forEach((b, i) => {
      const isDown = b.pressed || b.value > 0.5;
      if (isDown && !this.down.has(i)) this.pressed.add(i);
      if (isDown) this.down.add(i);
      else this.down.delete(i);
    });
  }

  isHeld(action: Action): boolean {
    return (PAD_BINDINGS[action] ?? []).some((b) => this.down.has(b));
  }

  consumePressed(action: Action): boolean {
    let hit = false;
    for (const b of PAD_BINDINGS[action] ?? []) if (this.pressed.delete(b)) hit = true;
    return hit;
  }

  /** Raw button edge (menu navigation). */
  consumeButton(index: number): boolean {
    return this.pressed.delete(index);
  }

  clearEdges(): void {
    this.pressed.clear();
  }
}
