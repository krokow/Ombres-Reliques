import { CLASSES, type ClassId } from '../data/classes';
import { emptyMods } from '../data/mods';
import {
  CARDS,
  cardById,
  PROGRESSION,
  talentById,
  TALENTS,
  xpToNext,
  type CardDef,
  type FlagId,
  type Mods,
} from '../data/progression';
import { enemyDef } from '../data/enemies';
import type { Character } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Sim } from '../game/sim';

/** A progression command from the UI, passed through the InputFrame so runs stay replayable. */
export type ProgressAction =
  { kind: 'card'; member: number; slot: number } | { kind: 'talent'; member: number; node: string };

function members(sim: Sim): Character[] {
  return sim.world.get(sim.player, 'party')?.members ?? [];
}

export function memberOf(sim: Sim, classId: ClassId): Character | undefined {
  return members(sim).find((m) => m.classId === classId);
}

export function activeMember(sim: Sim): Character | undefined {
  const p = sim.world.get(sim.player, 'party');
  return p?.members[p.active];
}

const NO_MODS = emptyMods();

/** Modifiers of the active character (empty if none, e.g. in tests without a party). */
export function activeMods(sim: Sim): Mods {
  return activeMember(sim)?.mods ?? NO_MODS;
}

export function hasFlag(sim: Sim, flag: FlagId, classId?: ClassId): boolean {
  const m = classId ? memberOf(sim, classId) : activeMember(sim);
  return m?.flags.has(flag) ?? false;
}

/** Cooldown after reductions (never below 30 % of the base). */
export function scaledCooldown(
  sim: Sim,
  ticks: number,
  kind: 'primary' | 'skill' | 'other' = 'other',
): number {
  const m = activeMods(sim);
  const extra =
    kind === 'skill' ? m.skillCooldownPct : kind === 'primary' ? m.primaryCooldownPct : 0;
  return Math.max(1, Math.round(ticks * Math.max(0.3, 1 - m.cooldownPct - extra)));
}

export function maxDashCharges(m: Character): number {
  return CLASSES[m.classId].dash.maxCharges + m.mods.extraDashCharges;
}

export function dashRechargeTicks(m: Character): number {
  const base = CLASSES[m.classId].dash.rechargeTicks;
  return Math.max(
    1,
    Math.round(base * Math.max(0.3, 1 - m.mods.cooldownPct - m.mods.dashRechargePct)),
  );
}

/** Rebuilds a character's modifiers and re-derives max HP (keeping missing HP constant). */
export function recompute(m: Character): void {
  const mods = emptyMods();
  const flags = new Set<FlagId>();
  const add = (partial: Partial<Mods> | undefined, times: number): void => {
    if (!partial) return;
    for (const [k, v] of Object.entries(partial) as [keyof Mods, number][]) mods[k] += v * times;
  };
  for (const [id, stacks] of Object.entries(m.progress.cards)) {
    const card = cardById(id);
    add(card?.mods, stacks);
    if (card?.flag) flags.add(card.flag);
  }
  for (const id of m.progress.talents) {
    const t = talentById(m.classId, id);
    add(t?.node.mods, 1);
    if (t?.node.flag) flags.add(t.node.flag);
  }
  m.mods = mods;
  m.flags = flags;
  const newMax = Math.round(CLASSES[m.classId].maxHp * (1 + mods.maxHpPct));
  if (newMax !== m.health.max) {
    if (!m.ko) m.health.hp = Math.max(1, m.health.hp + newMax - m.health.max);
    m.health.max = newMax;
  }
}

function eligibleCards(m: Character): CardDef[] {
  return CARDS.filter(
    (c) =>
      (c.classId === null || c.classId === m.classId) &&
      c.minLevel <= m.progress.level &&
      (m.progress.cards[c.id] ?? 0) < c.maxStacks,
  );
}

/** Rolls the next 3-card offer if a choice is pending (seeded, distinct cards). */
export function ensureOffer(sim: Sim, m: Character): void {
  if (m.progress.pendingCards <= 0 || m.progress.offer) return;
  const pool = eligibleCards(m);
  const offer: string[] = [];
  while (offer.length < PROGRESSION.cardsPerOffer && pool.length > 0) {
    const pick = sim.rng.progress.weighted(pool.map((c) => ({ weight: c.weight, value: c })));
    offer.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  m.progress.offer = offer;
}

/** Adds XP, resolving any number of level-ups. */
export function addXp(sim: Sim, m: Character, amount: number): void {
  if (m.ko || amount <= 0) return;
  const p = m.progress;
  p.xp += amount;
  while (p.level < PROGRESSION.maxLevel && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    p.pendingCards++;
    if (p.level % PROGRESSION.talentPointEvery === 0) p.talentPoints++;
    const t = sim.world.get(sim.player, 'transform');
    sim.events.push({
      type: 'levelUp',
      classId: m.classId,
      level: p.level,
      x: t?.x ?? 0,
      y: t?.y ?? 0,
    });
    ensureOffer(sim, m);
  }
  if (p.level >= PROGRESSION.maxLevel) p.xp = 0;
}

/** Kill XP: full for the active character, reduced for the reserve, none for the KO'd. */
export function awardKillXp(sim: Sim, target: Entity): void {
  const w = sim.world;
  const ai = w.get(target, 'enemy');
  const party = w.get(sim.player, 'party');
  if (!ai || !party) return;
  let xp = enemyDef(ai.defId).xp;
  if (w.has(target, 'elite')) xp *= PROGRESSION.eliteXpMult;
  if (w.has(target, 'champion')) xp *= PROGRESSION.championXpMult;
  party.members.forEach((m, i) => {
    addXp(sim, m, Math.round(i === party.active ? xp : xp * PROGRESSION.reserveXpRate));
  });
}

export function canTakeTalent(m: Character, nodeId: string): boolean {
  const t = talentById(m.classId, nodeId);
  if (!t || m.progress.talentPoints <= 0 || m.progress.talents.includes(nodeId)) return false;
  if (t.tier === 0) return true;
  const prev = TALENTS[m.classId][t.branch]?.nodes[t.tier - 1];
  return prev !== undefined && m.progress.talents.includes(prev.id);
}

/** Applies a UI command; invalid commands are ignored. */
export function applyProgressAction(sim: Sim, action: ProgressAction): boolean {
  const m = members(sim)[action.member];
  if (!m) return false;
  const p = m.progress;
  if (action.kind === 'card') {
    const id = p.offer?.[action.slot];
    if (!id || p.pendingCards <= 0) return false;
    p.cards[id] = (p.cards[id] ?? 0) + 1;
    p.pendingCards--;
    p.offer = null;
    recompute(m);
    sim.events.push({ type: 'cardTaken', classId: m.classId, card: id });
    ensureOffer(sim, m);
    return true;
  }
  if (!canTakeTalent(m, action.node)) return false;
  p.talents.push(action.node);
  p.talentPoints--;
  recompute(m);
  sim.events.push({ type: 'talentTaken', classId: m.classId, node: action.node });
  return true;
}
