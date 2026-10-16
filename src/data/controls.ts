/**
 * Bindings use KeyboardEvent.code (physical key position), so the same
 * binding is ZQSD on AZERTY and WASD on QWERTY with no layout detection.
 * "KeyQ" is the key labelled A on AZERTY. Mouse buttons are "Mouse0"/"Mouse2".
 */
export const KEY_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'KeyJ'],
  ranged: ['Mouse2', 'KeyK'],
  dash: ['Space', 'ShiftLeft'],
  skill: ['KeyQ'],
  /** Chests, shop, altar. */
  interact: ['KeyE'],
  ultimate: ['KeyR'],
  quick1: ['KeyF'],
  quick2: ['KeyG'],
  slot1: ['Digit1', 'Numpad1'],
  slot2: ['Digit2', 'Numpad2'],
  slot3: ['Digit3', 'Numpad3'],
  confirm: ['Enter', 'NumpadEnter'],
  retrySameSeed: ['Backspace'],
  mute: ['KeyM'],
  map: ['Tab'],
  progress: ['KeyC'],
  pause: ['Escape'],
  toggleDebug: ['F3'],
  toggleHitboxes: ['F4'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof KEY_BINDINGS;
