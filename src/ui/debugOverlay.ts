import type { CommandRegistry } from './commands';

/** Togglable DOM debug panel + command console. Kept off the canvas for crisp text. */
export class DebugOverlay {
  private readonly panel: HTMLDivElement;
  private readonly console: HTMLDivElement;
  private readonly log: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private lastText = '';
  visible = true;
  showHitboxes = false;

  constructor(
    root: HTMLElement,
    private readonly commands: CommandRegistry,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-overlay';
    this.console = document.createElement('div');
    this.console.className = 'debug-console hidden';
    this.log = document.createElement('div');
    this.log.className = 'debug-console__log';
    this.input = document.createElement('input');
    this.input.placeholder = 'commande… (help)';
    this.input.spellcheck = false;
    this.console.append(this.log, this.input);
    root.append(this.panel, this.console);

    // Opened straight from the keydown (not on the next frame) so no typed char is lost.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && !this.consoleOpen) {
        e.preventDefault();
        this.toggleConsole();
      }
    });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') {
        const line = this.input.value;
        this.input.value = '';
        this.print(`> ${line}`);
        const out = this.commands.execute(line);
        if (out) this.print(out);
      } else if (e.code === 'Backquote' || e.code === 'Escape') {
        e.preventDefault();
        this.toggleConsole();
      }
    });
  }

  get consoleOpen(): boolean {
    return !this.console.classList.contains('hidden');
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.classList.toggle('hidden', !this.visible);
  }

  toggleConsole(): void {
    const open = !this.consoleOpen;
    this.console.classList.toggle('hidden', !open);
    if (open) this.input.focus();
    else this.input.blur();
  }

  print(text: string): void {
    const line = document.createElement('div');
    line.textContent = text;
    this.log.append(line);
    this.log.scrollTop = this.log.scrollHeight;
  }

  setLines(lines: readonly string[]): void {
    if (!this.visible) return;
    const text = lines.join('\n');
    // Avoid layout thrash: only touch the DOM when the text changes.
    if (text !== this.lastText) {
      this.panel.textContent = text;
      this.lastText = text;
    }
  }
}
