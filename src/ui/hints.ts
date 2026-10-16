import { HINT_RULES, HINTS, type HintId } from '../data/hints';
import type { GameEvent } from '../game/events';
import type { Game } from '../game/game';
import { nearestInspectable, nearestInteractable } from '../systems/loot';
import type { SaveManager } from '../save/save';
import { CLASSES } from '../data/classes';
import { escapeHtml, withKeys } from './keyText';

/** Non-blocking contextual tips, each shown once (remembered in the save). */
export class Hints {
  private readonly root: HTMLDivElement;
  private queue: HintId[] = [];
  private current: { id: HintId; left: number } | null = null;
  private floorTime = 0;

  constructor(
    parent: HTMLElement,
    private readonly saves: SaveManager,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hint hidden';
    parent.append(this.root);
  }

  private get enabled(): boolean {
    const s = this.saves.data;
    return s.settings.hints && s.meta.runs < HINT_RULES.maxRuns;
  }

  private want(id: HintId): void {
    if (!this.enabled) return;
    if (this.saves.data.settings.hintsSeen.includes(id)) return;
    if (this.current?.id === id || this.queue.includes(id)) return;
    this.queue.push(id);
  }

  onEvent(ev: GameEvent): void {
    switch (ev.type) {
      case 'levelUp':
        return this.want('levelUp');
      case 'ko':
        return this.want('ko');
      case 'doorsLocked':
        return this.want('sealed');
      case 'stairsOpen':
        return this.want('stairs');
      case 'pickup':
        if (ev.kind === 'consumable') this.want('consumable');
        return;
      case 'floor':
        this.floorTime = 0;
        return;
      default:
        return;
    }
  }

  /** Polled conditions (state, not events) + display timing. */
  update(game: Game | null, dt: number, paused: boolean, covered = false): void {
    if (game && !paused && game.mode === 'dungeon') {
      const w = game.world;
      const h = w.req(game.player, 'health');
      const p = w.req(game.player, 'player');
      if (h.hp > 0 && h.hp / h.max < HINT_RULES.lowHpFraction) this.want('lowHp');
      if (p.energy >= CLASSES[p.classId].maxEnergy) this.want('ultimate');
      if (nearestInspectable(game) !== null) this.want('item');
      if (nearestInteractable(game) !== null) this.want('interact');
      this.floorTime += dt;
      if (this.floorTime > 90) this.want('map');
    }
    if (paused) return;
    if (this.current) {
      this.current.left -= dt;
      if (this.current.left <= 0) this.current = null;
    }
    if (!this.current && this.queue.length > 0) {
      const id = this.queue.shift() as HintId;
      this.current = { id, left: HINT_RULES.durationSeconds };
      const seen = this.saves.data.settings.hintsSeen;
      if (!seen.includes(id)) seen.push(id);
      this.saves.write();
      this.root.innerHTML = `<span class="hint-tag">Astuce</span> ${escapeHtml(withKeys(HINTS[id]))}`;
    }
    // Covered by an in-game panel: the tip waits (its timer too) instead of overlapping.
    if (covered && this.current) this.current.left += dt;
    const visible = this.current !== null && game !== null && !covered;
    this.root.classList.toggle('hidden', !visible);
    this.root.classList.toggle('fading', visible && (this.current?.left ?? 0) < 0.6);
  }

  clear(): void {
    this.queue = [];
    this.current = null;
    this.root.classList.add('hidden');
  }
}
