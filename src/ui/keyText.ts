import { KEY_BINDINGS, type Action } from '../data/controls';
import { keyLabel } from '../input/keyLabels';

/** Sentences have room for full names (the HUD uses the short labels). */
const LONG: Record<string, string> = {
  Mouse0: 'clic gauche',
  Mouse2: 'clic droit',
  Space: 'Espace',
};

/** Replaces {action} placeholders with the player's real key labels. */
export function withKeys(text: string): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => {
    if (!Object.hasOwn(KEY_BINDINGS, name)) return all;
    const code = KEY_BINDINGS[name as Action][0];
    return LONG[code] ?? keyLabel(code);
  });
}

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
