import { classDef } from '../data/classes';
import { cardById, TALENTS, xpToNext } from '../data/progression';
import type { Character } from '../ecs/components';
import type { Game } from '../game/game';
import { canTakeTalent, type ProgressAction } from '../systems/progression';

/**
 * Level-up & talent panel (design 1b): never pauses the game. Opened with C,
 * or automatically after clearing a room while choices are pending. Clicks
 * produce ProgressActions that the main loop feeds to the simulation, so the
 * choice is part of the replayable input stream.
 */
export class ProgressPanel {
  private readonly root: HTMLDivElement;
  private readonly queue: ProgressAction[] = [];
  private tab = -1;
  private lastKey = '';
  open = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'progress-panel hidden';
    parent.append(this.root);
    // Clicks on the panel must never reach the canvas (no accidental attacks).
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  toggle(game: Game): void {
    this.setOpen(!this.open, game);
  }

  setOpen(open: boolean, game: Game): void {
    this.open = open;
    this.root.classList.toggle('hidden', !open);
    if (open) {
      const party = game.world.req(game.player, 'party');
      // Default tab: the active character, or the first one with something to spend.
      const pending = party.members.findIndex(
        (m) => m.progress.pendingCards > 0 || m.progress.talentPoints > 0,
      );
      const active = party.members[party.active];
      this.tab =
        active && (active.progress.pendingCards > 0 || active.progress.talentPoints > 0)
          ? party.active
          : Math.max(0, pending);
      this.lastKey = '';
      this.render(game);
    }
  }

  /** Next queued action for the simulation, if any. */
  takeAction(): ProgressAction | null {
    return this.queue.shift() ?? null;
  }

  /** Re-renders only when the underlying state changed. */
  update(game: Game): void {
    if (!this.open) return;
    this.render(game);
  }

  private render(game: Game): void {
    const party = game.world.req(game.player, 'party');
    const key = JSON.stringify([
      this.tab,
      party.active,
      party.members.map((m) => [m.progress, m.ko]),
    ]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const m = party.members[this.tab];
    if (!m) return;

    const tabs = party.members
      .map((c, i) => {
        const def = classDef(c.classId);
        const badge = c.progress.pendingCards + c.progress.talentPoints > 0 ? ' ▲' : '';
        return `<button data-tab="${i}" class="pp-tab${i === this.tab ? ' active' : ''}" style="--c:${def.palette.trim}">${def.name} · Nv ${c.progress.level}${badge}</button>`;
      })
      .join('');

    this.root.innerHTML = `
      <div class="pp-tabs">${tabs}<button data-close class="pp-close">C ✕</button></div>
      ${this.renderHeader(m)}
      ${this.renderCards(m)}
      ${this.renderTalents(m)}
      <div class="pp-hint">Le jeu continue pendant le choix · C pour fermer</div>`;
  }

  private renderHeader(m: Character): string {
    const p = m.progress;
    const need = xpToNext(p.level);
    return `<div class="pp-header">
      <div class="pp-xp"><div style="width:${Math.min(100, (p.xp / need) * 100)}%"></div></div>
      <span>XP ${Math.floor(p.xp)} / ${need}</span>
      <span>Choix en attente : <b>${p.pendingCards}</b></span>
      <span>Points de talent : <b>${p.talentPoints}</b></span>
    </div>`;
  }

  private renderCards(m: Character): string {
    const offer = m.progress.offer;
    if (!offer || m.progress.pendingCards <= 0)
      return '<div class="pp-empty">Aucune amélioration en attente.</div>';
    const cards = offer
      .map((id, slot) => {
        const c = cardById(id);
        if (!c) return '';
        const stacks = m.progress.cards[id] ?? 0;
        return `<button class="pp-card${c.evolution ? ' evo' : ''}" data-card="${slot}">
          <strong>${c.name}</strong><span>${c.desc}</span>${c.maxStacks > 1 ? `<em>${stacks}/${c.maxStacks}</em>` : ''}
        </button>`;
      })
      .join('');
    return `<div class="pp-cards">${cards}</div>`;
  }

  private renderTalents(m: Character): string {
    const cols = TALENTS[m.classId]
      .map((branch) => {
        const nodes = branch.nodes
          .map((n) => {
            const taken = m.progress.talents.includes(n.id);
            const available = canTakeTalent(m, n.id);
            const cls = taken ? 'taken' : available ? 'available' : 'locked';
            return `<button class="pp-node ${cls}" data-node="${n.id}" ${available ? '' : 'disabled'}>
              <strong>${n.name}</strong><span>${n.desc}</span></button>`;
          })
          .join('<div class="pp-link"></div>');
        return `<div class="pp-branch"><h4>${branch.name}</h4>${nodes}</div>`;
      })
      .join('');
    return `<div class="pp-tree">${cols}</div>`;
  }

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest('button');
    if (!el) return;
    if (el.dataset.close !== undefined) {
      this.open = false;
      this.root.classList.add('hidden');
      return;
    }
    if (el.dataset.tab !== undefined) {
      this.tab = Number(el.dataset.tab);
      this.lastKey = '';
      return;
    }
    if (el.dataset.card !== undefined)
      this.queue.push({ kind: 'card', member: this.tab, slot: Number(el.dataset.card) });
    if (el.dataset.node !== undefined)
      this.queue.push({ kind: 'talent', member: this.tab, node: el.dataset.node });
  }
}
