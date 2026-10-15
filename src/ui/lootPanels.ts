import { classDef } from '../data/classes';
import { ITEM_BASES, RARITIES, RELICS, STAT_LABELS, type RelicDef } from '../data/items';
import type { Mods } from '../data/progression';
import type { Item } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Game } from '../game/game';
import type { UiAction } from '../systems/actions';
import {
  itemValue,
  nearestInspectable,
  nearestInteractable,
  type AltarOption,
} from '../systems/loot';
import { keyLabel } from '../input/keyLabels';
import { KEY_BINDINGS } from '../data/controls';

export function formatStat(stat: keyof Mods, value: number): string {
  const l = STAT_LABELS[stat];
  if (!l) return `${stat} ${value}`;
  if (!l.percent) return `${value > 0 ? '+' : ''}${value} ${l.label}`;
  const pct = value * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)} % ${l.label}`;
}

function itemHtml(item: Item | null): string {
  if (!item) return '<div class="lp-item empty">— vide —</div>';
  const r = RARITIES[item.rarity];
  return `<div class="lp-item" style="--r:${r.color}">
    <strong>${item.name}</strong>
    <small>${ITEM_BASES[item.slot].label} · ${r.name} · niv. ${item.level}</small>
    ${item.stats.map((s) => `<span>${formatStat(s.stat, s.value)}</span>`).join('')}
  </div>`;
}

function deltaHtml(next: Item, current: Item | null): string {
  const totals = new Map<keyof Mods, number>();
  for (const s of next.stats) totals.set(s.stat, (totals.get(s.stat) ?? 0) + s.value);
  for (const s of current?.stats ?? []) totals.set(s.stat, (totals.get(s.stat) ?? 0) - s.value);
  const lines = [...totals.entries()]
    .filter(([, v]) => Math.abs(v) > 1e-6)
    .map(([stat, v]) => `<span class="${v > 0 ? 'up' : 'down'}">${formatStat(stat, v)}</span>`);
  return lines.length > 0 ? lines.join('') : '<span>identique</span>';
}

/**
 * Design 1b: standing on an item shows a comparison with what each party
 * member wears, without pausing. Buttons queue UiActions for the sim.
 */
export class ComparePanel {
  private readonly root: HTMLDivElement;
  private readonly queue: UiAction[] = [];
  private shown: Entity | null = null;
  private lastKey = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'loot-panel compare hidden';
    parent.append(this.root);
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button');
      if (!el || this.shown === null) return;
      if (el.dataset.member !== undefined)
        this.queue.push({ kind: 'equip', item: this.shown, member: Number(el.dataset.member) });
      if (el.dataset.salvage !== undefined) this.queue.push({ kind: 'salvage', item: this.shown });
    });
  }

  takeAction(): UiAction | null {
    return this.queue.shift() ?? null;
  }

  update(game: Game): void {
    const e = game.playerAlive ? nearestInspectable(game) : null;
    const pk = e !== null ? game.world.get(e, 'pickup') : undefined;
    if (e === null || !pk) {
      this.shown = null;
      this.root.classList.add('hidden');
      this.lastKey = '';
      return;
    }
    this.shown = e;
    this.root.classList.remove('hidden');
    const party = game.world.req(game.player, 'party');
    const key = JSON.stringify([e, party.members.map((m) => m.equipment), party.active]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    if (pk.kind === 'relic') {
      const r: RelicDef = RELICS[pk.id];
      this.root.innerHTML = `<div class="lp-title">${r.curse ? 'Malédiction' : 'Relique d’équipe'}</div>
        <div class="lp-item" style="--r:${r.color}"><strong>${r.name}</strong><span>${r.desc}</span></div>
        <div class="lp-hint">${keyLabel(KEY_BINDINGS.interact[0])} : prendre</div>`;
      return;
    }
    if (pk.kind !== 'item') return;
    const item = pk.item;
    const cols = party.members
      .map((m, i) => {
        const def = classDef(m.classId);
        const current = m.equipment[item.slot];
        return `<div class="lp-col${i === party.active ? ' active' : ''}">
          <div class="lp-who" style="color:${def.palette.trim}">${def.name}</div>
          ${itemHtml(current)}
          <div class="lp-delta">${deltaHtml(item, current)}</div>
          <button data-member="${i}">Équiper</button>
        </div>`;
      })
      .join('');
    this.root.innerHTML = `<div class="lp-title">Trouvé</div>
      ${itemHtml(item)}
      <div class="lp-cols">${cols}</div>
      <div class="lp-actions"><button data-salvage>Recycler (+${itemValue(item)} or)</button>
      <span class="lp-hint">Le jeu continue · éloignez-vous pour laisser l’objet</span></div>`;
  }
}

const ALTAR_TEXT: Record<AltarOption, { title: string; desc: string }> = {
  revive: {
    title: 'Rappel',
    desc: 'Sacrifie 25 % des PV du personnage actif : les KO reviennent à 50 %.',
  },
  sacrifice: {
    title: 'Saignée',
    desc: '−15 % PV max pour le personnage actif (toute la run) : une relique d’équipe.',
  },
  pact: { title: 'Pacte', desc: 'Un objet légendaire… et une malédiction pour toute l’équipe.' },
};

/** Altar choices, shown when the altar is used (E); closes when walking away. */
export class AltarPanel {
  private readonly root: HTMLDivElement;
  private readonly queue: UiAction[] = [];
  private altar: Entity | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'loot-panel altar hidden';
    parent.append(this.root);
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button');
      if (!el?.dataset.option) return;
      this.queue.push({ kind: 'altar', option: el.dataset.option as AltarOption });
    });
  }

  takeAction(): UiAction | null {
    return this.queue.shift() ?? null;
  }

  show(altar: Entity, options: AltarOption[]): void {
    this.altar = altar;
    this.root.innerHTML = `<div class="lp-title">Autel des ombres</div>${options
      .map(
        (o) =>
          `<button class="lp-option" data-option="${o}"><strong>${ALTAR_TEXT[o].title}</strong><span>${ALTAR_TEXT[o].desc}</span></button>`,
      )
      .join('')}`;
    this.root.classList.remove('hidden');
  }

  update(game: Game): void {
    if (this.altar === null) return;
    const it = game.world.get(this.altar, 'interactable');
    if (!it || it.kind !== 'altar' || it.used || nearestInteractable(game) !== this.altar) {
      this.altar = null;
      this.root.classList.add('hidden');
    }
  }
}
