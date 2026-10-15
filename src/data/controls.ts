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
  /** Reserved for interactions (chests, altars, shop) in M6. */
  interact: ['KeyE'],
  ultimate: ['KeyR'],
  confirm: ['Enter', 'NumpadEnter'],
  retrySameSeed: ['Backspace'],
  mute: ['KeyM'],
  map: ['Tab'],
  toggleDebug: ['F3'],
  toggleHitboxes: ['F4'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof KEY_BINDINGS;
