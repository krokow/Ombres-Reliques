/** Fallback labels when the Keyboard Layout Map API is unavailable (Firefox, Safari). */
const FALLBACK: Record<string, string> = {
  // Short labels: they must fit in a HUD skill slot.
  Space: 'Esp',
  ShiftLeft: 'Maj',
  Enter: 'Entr',
  Backspace: '⌫',
  Backquote: '²',
  Mouse0: 'CG',
  Mouse2: 'CD',
};

const layout = new Map<string, string>();

interface LayoutMapNavigator {
  keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
}

/** Loads the user's real layout (Chromium) so "KeyQ" shows as "A" on AZERTY. */
export async function loadKeyLayout(): Promise<void> {
  const nav = navigator as Navigator & LayoutMapNavigator;
  try {
    const map = await nav.keyboard?.getLayoutMap?.();
    map?.forEach((value, key) => layout.set(key, value.toUpperCase()));
  } catch {
    // Permission policy or unsupported: keep fallbacks.
  }
}

export function keyLabel(code: string): string {
  const mapped = layout.get(code)?.trim();
  return mapped || FALLBACK[code] || code.replace(/^Key|^Digit/, '');
}
