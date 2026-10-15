/**
 * Bindings use KeyboardEvent.code (physical key position), so the same
 * binding is ZQSD on AZERTY and WASD on QWERTY with no layout detection.
 * Mouse buttons are "Mouse0" (left), "Mouse2" (right).
 */
export const KEY_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'KeyJ'],
  ranged: ['Mouse2', 'KeyK'],
  dash: ['Space', 'ShiftLeft'],
  confirm: ['Enter', 'NumpadEnter'],
  retrySameSeed: ['Backspace'],
  mute: ['KeyM'],
  toggleDebug: ['F3'],
  toggleHitboxes: ['F4'],
  toggleConsole: ['Backquote'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof KEY_BINDINGS;
