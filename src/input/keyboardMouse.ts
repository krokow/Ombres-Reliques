import { KEY_BINDINGS, type Action } from '../data/controls';

/**
 * Collects raw DOM keyboard/mouse state. Held state is queried directly;
 * "pressed" edges are buffered until consumed so a press shorter than a tick
 * is never lost, and consumed once even when several ticks run in a frame.
 */
export class KeyboardMouse {
  private readonly held = new Set<string>();
  private readonly pressedBuffer = new Set<string>();
  private readonly codeToActions = new Map<string, Action[]>();
  mouseX = 0;
  mouseY = 0;
  /** When true (e.g. console focused), gameplay input is ignored. */
  suspended = false;

  constructor(private readonly target: HTMLElement) {
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, readonly string[]][]) {
      for (const code of codes) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(action);
        this.codeToActions.set(code, list);
      }
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isHeld(action: Action): boolean {
    return KEY_BINDINGS[action].some((code) => this.held.has(code));
  }

  /** Returns true once per physical press. */
  consumePressed(action: Action): boolean {
    let hit = false;
    for (const code of KEY_BINDINGS[action]) {
      if (this.pressedBuffer.delete(code)) hit = true;
    }
    return hit;
  }

  clearEdges(): void {
    this.pressedBuffer.clear();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const bound = this.codeToActions.has(e.code);
    if (bound && this.suspended && e.code !== 'Backquote') return;
    if (bound) e.preventDefault();
    if (!e.repeat) this.pressedBuffer.add(e.code);
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    const rect = this.target.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (this.suspended) return;
    this.held.add(`Mouse${e.button}`);
    this.pressedBuffer.add(`Mouse${e.button}`);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.held.delete(`Mouse${e.button}`);
  };
}
