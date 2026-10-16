import { TUTORIAL } from '../data/tutorial';
import type { Game } from '../game/game';
import { goalCount, tutorialStep } from '../systems/tutorial';
import { escapeHtml, withKeys } from './keyText';

/** Objective box of the training room (top of the screen, never blocks play). */
export class TutorialPanel {
  private readonly root: HTMLDivElement;
  private lastKey = '';

  constructor(
    parent: HTMLElement,
    private readonly actions: { skip(): void; play(): void; title(): void },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'tuto hidden';
    parent.append(this.root);
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-tuto]')?.dataset.tuto;
      if (a === 'skip') this.actions.skip();
      else if (a === 'play') this.actions.play();
      else if (a === 'title') this.actions.title();
    });
  }

  update(game: Game | null): void {
    const t = game?.tutorial ?? null;
    if (!t) {
      this.root.classList.add('hidden');
      this.lastKey = '';
      return;
    }
    const step = tutorialStep(t);
    const total = step ? goalCount(step) : 1;
    const shown = step?.goal.kind === 'move' ? Math.floor((t.progress / total) * 100) : t.progress;
    const key = `${t.step}|${shown}|${t.done}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.root.classList.remove('hidden');
    if (t.done || !step) {
      this.root.innerHTML = `
        <div class="tuto-head">Entraînement terminé</div>
        <p>Tu connais les bases. Les astuces continueront d’apparaître pendant tes premières runs.</p>
        <div class="tuto-buttons">
          <button data-tuto="title">Titre</button>
          <button data-tuto="play" class="primary">Composer l’équipe</button>
        </div>`;
      return;
    }
    const pct = Math.min(1, t.progress / total) * 100;
    const count = step.goal.kind === 'move' ? `${Math.min(100, shown)} %` : `${shown} / ${total}`;
    this.root.innerHTML = `
      <div class="tuto-head"><span>${t.step + 1}/${TUTORIAL.length}</span> ${escapeHtml(step.title)}
        <button data-tuto="skip" class="tuto-skip">Passer l’entraînement</button></div>
      <p>${escapeHtml(withKeys(step.text))}</p>
      <div class="tuto-bar"><i style="width:${pct}%"></i></div><small>${count}</small>`;
  }
}
