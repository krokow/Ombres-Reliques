import { CLASS_IDS, CLASSES, type ClassId } from '../data/classes';
import { KEY_BINDINGS, type Action } from '../data/controls';
import { RUN_FLOORS } from '../data/biomes';
import {
  DIFFICULTIES,
  isDifficultyId,
  type DifficultyDef,
  type DifficultyId,
} from '../data/dungeon';
import { META, UNLOCKS, UPGRADES } from '../data/meta';
import type { RunStats } from '../game/runStats';
import type { RunSnapshot } from '../game/snapshot';
import { keyLabel } from '../input/keyLabels';
import {
  dailyChallenge,
  priceOf,
  unlockedClasses,
  type Purchase,
  type RunRecord,
} from '../save/meta';
import type { SaveData, Settings } from '../save/save';

/** What the menus need from the app; they never touch the simulation directly. */
export interface MenuHost {
  save(): SaveData;
  today(): string;
  continueRun(): void;
  startRun(team: ClassId[], seed: string | null): void;
  startDaily(): void;
  buy(p: Purchase): void;
  resume(): void;
  quitToTitle(): void;
  abandon(): void;
  /** End panel: bank a won run (victory) or keep going in endless mode. */
  finishVictory(): void;
  newRunSameTeam(sameSeed: boolean): void;
  wipeSave(): void;
  startTutorial(): void;
  /** True while the training room is running (pause menu differs). */
  inTutorial(): boolean;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

type Screen =
  | 'none'
  | 'title'
  | 'team'
  | 'sanctuary'
  | 'history'
  | 'controls'
  | 'options'
  | 'pause'
  | 'victory'
  | 'end';

export interface EndSummary {
  record: RunRecord;
  stats: RunStats;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function duration(ticks: number): string {
  const s = Math.floor(ticks / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function teamLabel(team: readonly ClassId[]): string {
  return team.map((id) => CLASSES[id].name).join(' · ');
}

function classDot(id: ClassId): string {
  const p = CLASSES[id].palette;
  return `<span class="mn-dot" style="--b:${p.body};--t:${p.trim}"></span>`;
}

/**
 * DOM menus over the canvas: title, team selection, sanctuary (meta shop),
 * history, controls, pause and end-of-run panels. Menus pause the game
 * (unlike the in-run panels, which never do).
 */
export class Menus {
  private readonly root: HTMLDivElement;
  private screen: Screen = 'none';
  private picked: ClassId[] = [];
  private seed = '';
  private confirmAbandon = false;
  private confirmWipe = false;
  private end: EndSummary | null = null;
  private notice: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly host: MenuHost,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menus hidden';
    parent.append(this.root);
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.field === 'seed') this.seed = t.value;
      const opt = t.dataset.option as keyof Settings | undefined;
      if (opt === 'sfxVolume' || opt === 'musicVolume')
        this.host.setSetting(opt, Number(t.value) / 100);
      else if (opt === 'shake' || opt === 'hints' || opt === 'lighting')
        this.host.setSetting(opt, t.checked);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get open(): boolean {
    return this.screen !== 'none';
  }

  /** In-run panels that don't pause (end screens) still let the world render behind. */
  get pausesGame(): boolean {
    return this.screen !== 'none' && this.screen !== 'end';
  }

  get current(): Screen {
    return this.screen;
  }

  show(screen: Screen): void {
    this.screen = screen;
    this.confirmAbandon = false;
    this.confirmWipe = false;
    if (screen === 'team' && this.picked.length === 0) {
      const last = this.host.save().history.find((r) => !r.daily)?.team ?? [];
      const allowed = unlockedClasses(this.host.save().meta);
      this.picked = last.filter((id) => allowed.includes(id)).slice(0, 3);
    }
    this.render();
  }

  hide(): void {
    this.screen = 'none';
    this.render();
  }

  setNotice(text: string | null): void {
    this.notice = text;
    if (this.screen === 'title') this.render();
  }

  showEnd(summary: EndSummary): void {
    this.end = summary;
    this.show('end');
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen === 'none') return;
    if (e.target instanceof HTMLInputElement && e.code !== 'Escape' && e.code !== 'Enter') return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.screen === 'pause') this.host.resume();
      else if (
        this.screen === 'team' ||
        this.screen === 'sanctuary' ||
        this.screen === 'history' ||
        this.screen === 'controls' ||
        this.screen === 'options'
      )
        this.show('title');
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.screen === 'team' && this.picked.length === 3) {
        e.preventDefault();
        this.host.startRun([...this.picked], this.seed.trim() || null);
      } else if (this.screen === 'end') {
        e.preventDefault();
        this.host.newRunSameTeam(false);
      }
    } else if (e.code === 'Backspace' && this.screen === 'end') {
      e.preventDefault();
      this.host.newRunSameTeam(true);
    }
  }

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || el.hasAttribute('disabled')) return;
    const a = el.dataset.action ?? '';
    const arg = el.dataset.arg ?? '';
    switch (a) {
      case 'continue':
        return this.host.continueRun();
      case 'new':
        return this.show('team');
      case 'daily':
        return this.host.startDaily();
      case 'screen':
        return this.show(arg as Screen);
      case 'pick': {
        const id = arg as ClassId;
        const i = this.picked.indexOf(id);
        if (i >= 0) this.picked.splice(i, 1);
        else if (this.picked.length < 3) this.picked.push(id);
        return this.render();
      }
      case 'launch':
        if (this.picked.length === 3)
          this.host.startRun([...this.picked], this.seed.trim() || null);
        return;
      case 'buy': {
        const [kind, id = ''] = arg.split('|');
        this.host.buy({ kind: kind === 'unlock' ? 'unlock' : 'upgrade', id });
        return this.render();
      }
      case 'resume':
        return this.host.resume();
      case 'quit':
        return this.host.quitToTitle();
      case 'abandon':
        if (!this.confirmAbandon) {
          this.confirmAbandon = true;
          return this.render();
        }
        return this.host.abandon();
      case 'endless':
        return this.host.resume();
      case 'finish':
        return this.host.finishVictory();
      case 'again':
        return this.host.newRunSameTeam(arg === 'seed');
      case 'difficulty':
        if (isDifficultyId(arg)) this.host.setSetting('difficulty', arg);
        return this.render();
      case 'tutorial':
        return this.host.startTutorial();
      case 'resetHints':
        this.host.setSetting('hintsSeen', []);
        return this.render();
      case 'wipe':
        if (!this.confirmWipe) {
          this.confirmWipe = true;
          return this.render();
        }
        this.host.wipeSave();
        return this.show('title');
    }
  }

  private render(): void {
    this.root.classList.toggle('hidden', this.screen === 'none');
    this.root.classList.toggle(
      'mn-overlay',
      this.screen === 'end' || this.screen === 'pause' || this.screen === 'victory',
    );
    if (this.screen === 'none') {
      this.root.innerHTML = '';
      return;
    }
    const body = {
      title: () => this.title(),
      team: () => this.team(),
      sanctuary: () => this.sanctuary(),
      history: () => this.history(),
      controls: () => this.controls(),
      options: () => this.options(),
      pause: () => this.pause(),
      victory: () => this.victory(),
      end: () => this.endPanel(),
    }[this.screen]();
    this.root.innerHTML = `<div class="mn-card mn-${this.screen}">${body}</div>`;
    this.root.querySelector<HTMLInputElement>('[data-field="seed"]')?.focus();
  }

  private shards(): string {
    return `<span class="mn-shards">◆ ${this.host.save().meta.shards} ${META.currency}</span>`;
  }

  private title(): string {
    const save = this.host.save();
    const run: RunSnapshot | null = save.run;
    const today = this.host.today();
    const daily = dailyChallenge(today);
    const dailyDone = save.meta.lastDaily === today;
    const m = save.meta;
    return `
      <h1 class="mn-logo">Ombres <span>&amp;</span> Reliques</h1>
      <p class="mn-sub">Roguelike d’équipe · trois héros, un seul corps à l’écran</p>
      <div class="mn-buttons">
        ${
          run
            ? `<button data-action="continue" class="mn-primary">Continuer<small>${run.daily ? 'Défi du jour · ' : ''}Étage ${run.level} · ${esc(teamLabel(run.members.map((x) => x.classId)))}</small></button>`
            : ''
        }
        ${
          save.settings.tutorialDone
            ? ''
            : `<button data-action="tutorial" class="${run ? '' : 'mn-primary'}">Entraînement<small>recommandé pour une première partie · 3 minutes</small></button>`
        }
        <button data-action="new" class="${run || !save.settings.tutorialDone ? '' : 'mn-primary'}">Nouvelle run${run ? '<small>remplace la run en cours</small>' : ''}</button>
        <button data-action="daily">Défi du jour<small>${today} · Difficile · ${esc(teamLabel(daily.team))}${dailyDone ? ' · déjà récompensé' : ` · récompense ×${META.rewards.dailyMult}`}</small></button>
        <button data-action="screen" data-arg="sanctuary">Sanctuaire<small>déblocages et améliorations</small></button>
        <button data-action="screen" data-arg="history">Historique</button>
        <div class="mn-row-buttons">
          <button data-action="screen" data-arg="controls">Commandes</button>
          <button data-action="screen" data-arg="options">Options</button>
          ${save.settings.tutorialDone ? '<button data-action="tutorial">Entraînement</button>' : ''}
        </div>
      </div>
      <div class="mn-foot">${this.shards()} · ${m.runs} run${m.runs > 1 ? 's' : ''} · ${m.victories} victoire${m.victories > 1 ? 's' : ''} · meilleur étage ${m.bestFloor || '—'}</div>
      ${this.notice ? `<div class="mn-notice">${esc(this.notice)}</div>` : ''}`;
  }

  private team(): string {
    const meta = this.host.save().meta;
    const allowed = unlockedClasses(meta);
    const cards = CLASS_IDS.map((id) => {
      const def = CLASSES[id];
      const locked = !allowed.includes(id);
      const slot = this.picked.indexOf(id);
      const unlock = UNLOCKS.find((u) => u.kind === 'class' && u.classId === id);
      return `<button class="mn-class${slot >= 0 ? ' picked' : ''}${locked ? ' locked' : ''}" data-action="pick" data-arg="${id}" ${locked ? 'disabled' : ''} style="--t:${def.palette.trim};--b:${def.palette.body}">
        ${slot >= 0 ? `<span class="mn-slot">${slot + 1}</span>` : ''}
        <span class="mn-portrait"></span>
        <strong>${def.name}</strong><em>${def.role}</em>
        <span class="mn-blurb">${esc(def.blurb)}</span>
        <span class="mn-kit">${def.labels.skill} · ${def.labels.ultimate}</span>
        ${locked ? `<span class="mn-lock">🔒 ${unlock?.cost ?? '?'} ${META.currency} au Sanctuaire</span>` : ''}
      </button>`;
    }).join('');
    const ready = this.picked.length === 3;
    return `
      <h2>Composer l’équipe</h2>
      <p class="mn-help">Choisissez 3 héros dans l’ordre des touches 1, 2, 3. Le premier entre en jeu.</p>
      <div class="mn-classes">${cards}</div>
      <div class="mn-row">
        <label>Seed <input data-field="seed" value="${esc(this.seed)}" placeholder="aléatoire" maxlength="24" spellcheck="false" /></label>
        <span class="mn-team">${this.picked.length ? esc(teamLabel(this.picked)) : '—'}</span>
      </div>
      <div class="mn-difficulty">${(Object.keys(DIFFICULTIES) as DifficultyId[])
        .map((id) => {
          const d: DifficultyDef = DIFFICULTIES[id];
          const on = this.host.save().settings.difficulty === id;
          return `<button data-action="difficulty" data-arg="${id}" class="${on ? 'picked' : ''}"><strong>${d.name}</strong><small>${esc(d.desc)}</small></button>`;
        })
        .join('')}</div>
      <div class="mn-buttons mn-inline">
        <button data-action="screen" data-arg="title">Retour</button>
        <button data-action="launch" class="mn-primary" ${ready ? '' : 'disabled'}>Lancer la run</button>
      </div>`;
  }

  private sanctuary(): string {
    const meta = this.host.save().meta;
    const line = (p: Purchase, name: string, desc: string, state: string): string => {
      const price = priceOf(meta, p);
      const owned =
        p.kind === 'unlock'
          ? meta.unlocked.includes(p.id)
          : (meta.upgrades[p.id] ?? 0) >= (UPGRADES.find((u) => u.id === p.id)?.costs.length ?? 0);
      const can = price !== null && meta.shards >= price;
      return `<div class="mn-shop${owned ? ' owned' : ''}">
        <div><strong>${esc(name)}</strong> ${state}<br /><small>${esc(desc)}</small></div>
        <button data-action="buy" data-arg="${p.kind}|${p.id}" ${can ? '' : 'disabled'}>${owned ? 'Acquis' : price === null ? 'Verrouillé' : `◆ ${price}`}</button>
      </div>`;
    };
    const unlocks = UNLOCKS.map((u) => {
      const req = u.kind === 'relics' && u.requires && !meta.unlocked.includes(u.requires);
      return line(
        { kind: 'unlock', id: u.id },
        u.name,
        req ? `${u.desc} (après le précédent)` : u.desc,
        u.kind === 'class' ? '<em>classe</em>' : '<em>reliques</em>',
      );
    }).join('');
    const upgrades = UPGRADES.map((up) => {
      const rank = meta.upgrades[up.id] ?? 0;
      const pips = Array.from({ length: up.costs.length }, (_, i) => (i < rank ? '●' : '○')).join(
        '',
      );
      return line(
        { kind: 'upgrade', id: up.id },
        up.name,
        up.desc,
        `<span class="mn-pips">${pips}</span>`,
      );
    }).join('');
    return `
      <h2>Sanctuaire</h2>
      <p class="mn-help">Les ${META.currency} se gagnent à la fin de chaque run (profondeur, gardiens vaincus, victoire). ${this.shards()}</p>
      <h3>Déblocages</h3>${unlocks}
      <h3>Améliorations permanentes</h3>
      <p class="mn-help">Volontairement légères : elles ne s’appliquent pas au défi du jour.</p>
      ${upgrades}
      <div class="mn-buttons mn-inline"><button data-action="screen" data-arg="title">Retour</button></div>`;
  }

  private history(): string {
    const { meta, history } = this.host.save();
    const rows = history
      .map(
        (r) => `<tr>
          <td>${esc(r.date)}${r.daily ? ' <em>jour</em>' : ''}${r.difficulty && r.difficulty !== 'normal' ? ` <em>${DIFFICULTIES[r.difficulty].name}</em>` : ''}</td>
          <td>${r.team.map(classDot).join('')}</td>
          <td>${r.victory ? `<b>Victoire</b>${r.floor > RUN_FLOORS ? ` +${r.floor - RUN_FLOORS}` : ''}` : r.outcome === 'abandon' ? `Abandon ét. ${r.floor}` : `Étage ${r.floor}`}</td>
          <td>${r.kills}</td><td>${duration(r.ticks)}</td><td>◆ ${r.shards}</td>
          <td class="mn-seed">${esc(r.seed)}</td>
        </tr>`,
      )
      .join('');
    return `
      <h2>Historique</h2>
      <div class="mn-stats">
        <div><b>${meta.runs}</b>runs</div><div><b>${meta.victories}</b>victoires</div>
        <div><b>${meta.bestFloor || '—'}</b>meilleur étage</div><div><b>${meta.totalKills}</b>éliminations</div>
        <div><b>${meta.totalShards}</b>${META.currency} gagnés</div>
      </div>
      ${rows ? `<table class="mn-table"><thead><tr><th>Date</th><th>Équipe</th><th>Résultat</th><th>Kills</th><th>Durée</th><th>Gain</th><th>Seed</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="mn-help">Aucune run terminée pour l’instant.</p>'}
      <div class="mn-buttons mn-inline">
        <button data-action="screen" data-arg="title">Retour</button>
        <button data-action="wipe" class="mn-danger">${this.confirmWipe ? 'Vraiment tout effacer ?' : 'Effacer la sauvegarde'}</button>
      </div>`;
  }

  private controls(): string {
    const rows: [string, Action[]][] = [
      ['Se déplacer', ['up', 'left', 'down', 'right']],
      ['Attaque principale (maintenir pour enchaîner)', ['attack']],
      ['Action secondaire', ['ranged']],
      ['Mobilité (dash, charge, blink…)', ['dash']],
      ['Compétence', ['skill']],
      ['Ultime', ['ultimate']],
      ['Changer de héros', ['slot1', 'slot2', 'slot3']],
      ['Interagir (coffre, boutique, autel)', ['interact']],
      ['Consommables', ['quick1', 'quick2']],
      ['Progression (cartes, talents)', ['progress']],
      ['Carte', ['map']],
      ['Son', ['mute']],
      ['Pause', []],
      ['Debug / hitboxes / console', ['toggleDebug', 'toggleHitboxes']],
    ];
    const keys = (acts: Action[]): string =>
      acts.length === 0
        ? '<kbd>Échap</kbd>'
        : acts.map((a) => `<kbd>${esc(keyLabel(KEY_BINDINGS[a][0]))}</kbd>`).join(' ');
    return `
      <h2>Commandes</h2>
      <table class="mn-table mn-keys">${rows.map(([label, acts]) => `<tr><td>${label}</td><td>${keys(acts)}${label === 'Debug / hitboxes / console' ? ' <kbd>²</kbd>' : ''}</td></tr>`).join('')}</table>
      <p class="mn-help">Les touches suivent la position physique : ZQSD en AZERTY, WASD en QWERTY.</p>
      <div class="mn-buttons mn-inline"><button data-action="screen" data-arg="title">Retour</button></div>`;
  }

  private options(): string {
    const s = this.host.save().settings;
    const range = (key: 'sfxVolume' | 'musicVolume', label: string): string =>
      `<label class="mn-option">${label}<input type="range" min="0" max="100" step="5" data-option="${key}" value="${Math.round(s[key] * 100)}" /></label>`;
    const check = (key: 'shake' | 'hints' | 'lighting', label: string): string =>
      `<label class="mn-option">${label}<input type="checkbox" data-option="${key}" ${s[key] ? 'checked' : ''} /></label>`;
    return `
      <h2>Options</h2>
      ${range('sfxVolume', 'Effets sonores')}
      ${range('musicVolume', 'Musique')}
      ${check('shake', 'Tremblements de caméra')}
      ${check('lighting', 'Éclairage dynamique')}
      ${check('hints', 'Astuces pendant les premières runs')}
      <p class="mn-help">${keyLabel(KEY_BINDINGS.mute[0])} coupe tout le son en jeu.</p>
      <div class="mn-buttons mn-inline">
        <button data-action="resetHints">Revoir les astuces</button>
        <button data-action="screen" data-arg="title">Retour</button>
      </div>`;
  }

  private pause(): string {
    if (this.host.inTutorial())
      return `
      <h2>Pause</h2>
      <div class="mn-buttons">
        <button data-action="resume" class="mn-primary">Reprendre</button>
        <button data-action="quit">Quitter l’entraînement</button>
      </div>`;
    return `
      <h2>Pause</h2>
      <div class="mn-buttons">
        <button data-action="resume" class="mn-primary">Reprendre</button>
        <button data-action="quit">Retour au titre<small>la run reprendra au début de cet étage</small></button>
        <button data-action="abandon" class="mn-danger">${this.confirmAbandon ? 'Confirmer l’abandon' : 'Abandonner la run'}<small>les ${META.currency} gagnés jusqu’ici sont versés</small></button>
      </div>`;
  }

  private victory(): string {
    return `
      <h2 class="mn-gold">Victoire !</h2>
      <p class="mn-help">Le Cœur de la Forge s’est éteint : les reliques sont vôtres.</p>
      <div class="mn-buttons">
        <button data-action="endless" class="mn-primary">Continuer en mode infini<small>les biomes reviennent, plus durs ; les gains sont versés à la fin</small></button>
        <button data-action="finish">Terminer la run<small>encaisser les ${META.currency} maintenant</small></button>
      </div>`;
  }

  private endPanel(): string {
    const e = this.end;
    if (!e) return '';
    const s = e.stats;
    const title = e.record.victory
      ? '<h2 class="mn-gold">Run terminée — victoire</h2>'
      : e.record.outcome === 'abandon'
        ? '<h2>Run abandonnée</h2>'
        : '<h2>Fin de la run</h2>';
    return `${title}
      <div class="mn-stats">
        <div><b>${s.deepestFloor}</b>étage atteint</div><div><b>${s.kills}</b>éliminations</div>
        <div><b>${s.minibosses + s.bosses}</b>gardiens vaincus</div><div><b>${duration(s.ticks)}</b>durée</div>
        <div><b>${Math.round(s.damageDealt)}</b>dégâts infligés</div><div><b>${Math.round(s.damageTaken)}</b>dégâts subis</div>
      </div>
      <p class="mn-reward">+ ◆ ${e.record.shards} ${META.currency}${e.record.daily && e.record.shards === 0 ? ' (défi du jour déjà récompensé)' : ''} · total ${this.host.save().meta.shards}</p>
      <p class="mn-help">Seed ${esc(e.record.seed)} · ${esc(teamLabel(e.record.team))}</p>
      <div class="mn-buttons mn-inline">
        <button data-action="screen" data-arg="title">Titre</button>
        <button data-action="again" data-arg="seed">Même seed <kbd>⌫</kbd></button>
        <button data-action="again" class="mn-primary">Nouvelle run <kbd>Entrée</kbd></button>
      </div>`;
  }
}
