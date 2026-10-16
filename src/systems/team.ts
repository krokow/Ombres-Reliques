import { CLASSES } from '../data/classes';
import { TEAM } from '../data/team';
import type { Character, Party } from '../ecs/components';
import type { Sim } from '../game/sim';
import { kitFor } from './kits';
import { cancelCombo } from './player';
import { dashRechargeTicks, hasFlag, maxDashCharges } from './progression';
import { applyStatus } from './statuses';
import { tickRage } from './rage';

/** Party helpers. The active character's components live on the player entity. */

export function party(sim: Sim): Party {
  return sim.world.req(sim.player, 'party');
}

export function activeMember(sim: Sim): Character {
  const p = party(sim);
  const m = p.members[p.active];
  if (!m) throw new Error('No active party member');
  return m;
}

/** Installs a member's components on the player entity. */
export function install(sim: Sim, index: number): void {
  const w = sim.world;
  const e = sim.player;
  const p = party(sim);
  const m = p.members[index];
  if (!m) return;
  p.active = index;
  w.add(e, 'player', m.state);
  w.add(e, 'health', m.health);
  w.add(e, 'dash', m.dash);
  w.add(e, 'combo', m.combo);
  w.add(e, 'statuses', m.statuses);
  const def = CLASSES[m.classId];
  const body = w.req(e, 'body');
  body.radius = def.radius;
  body.weight = def.weight;
  w.add(e, 'mover', { ...def.mover });
  w.req(e, 'renderable').kind = m.classId;
}

export function canSwitchTo(sim: Sim, index: number): boolean {
  const p = party(sim);
  const m = p.members[index];
  return (
    m !== undefined &&
    index !== p.active &&
    !m.ko &&
    m.lockout <= 0 &&
    p.switchCooldown <= 0 &&
    !kitFor(activeMember(sim).classId).busy(sim)
  );
}

/**
 * Swaps the active character. The one leaving drops its statuses (switching
 * out cleanses) and can't come back for a while (design 2c); the one
 * arriving triggers its entry effect.
 */
export function switchTo(sim: Sim, index: number, forced = false): boolean {
  const w = sim.world;
  const p = party(sim);
  const leaving = activeMember(sim);
  const arriving = p.members[index];
  if (!arriving || arriving.ko || index === p.active) return false;

  cancelCombo(sim);
  leaving.state.blockTicks = -1;
  leaving.state.execution = null;
  leaving.state.spin = 0;
  leaving.statuses.list = [];
  // Relic "Sablier fêlé": faster rotations.
  const hourglass = hasFlag(sim, 'brokenHourglass') ? 0.6 : 1;
  leaving.lockout = forced ? 0 : Math.round(TEAM.reentryLockoutTicks * hourglass);
  const dash = w.req(sim.player, 'dash');
  dash.active = 0;

  install(sim, index);
  p.switchCooldown = Math.round(TEAM.switchCooldownTicks * hourglass);
  // Relic "Totem du relais": arriving fired up.
  if (hasFlag(sim, 'relayTotem')) applyStatus(sim, sim.player, 'empowered', 120);
  const h = w.req(sim.player, 'health');
  h.invuln = Math.max(h.invuln, forced ? TEAM.koSwitchInvulnTicks : TEAM.switchInvulnTicks);
  h.stagger = 0;
  const t = w.req(sim.player, 'transform');
  sim.events.push({
    type: 'switch',
    from: leaving.classId,
    to: arriving.classId,
    x: t.x,
    y: t.y,
    forced,
  });
  kitFor(arriving.classId).entry(sim);
  return true;
}

/** Buffered 1/2/3 presses. */
export function handleSwitchInput(sim: Sim): void {
  const buffer = sim.world.req(sim.player, 'buffer');
  if (buffer.switchTicks <= 0 || buffer.switchSlot < 0) return;
  if (!canSwitchTo(sim, buffer.switchSlot)) {
    // A press on the active or a KO'd slot is simply dropped.
    const m = party(sim).members[buffer.switchSlot];
    if (!m || m.ko || buffer.switchSlot === party(sim).active) buffer.switchTicks = 0;
    return;
  }
  switchTo(sim, buffer.switchSlot);
  buffer.switchTicks = 0;
}

/** Cooldowns, mana and recharges tick for every member; reserves also regenerate. */
export function tickParty(sim: Sim): void {
  const p = party(sim);
  if (p.switchCooldown > 0) p.switchCooldown--;
  p.members.forEach((m, i) => {
    const s = m.state;
    const def = CLASSES[m.classId];
    if (s.primaryCooldown > 0) s.primaryCooldown--;
    if (s.rangedCooldown > 0) s.rangedCooldown--;
    if (s.skillCooldown > 0) s.skillCooldown--;
    if (m.lockout > 0) m.lockout--;
    if (def.id === 'arcanist') {
      const regen = def.manaRegenPerSecond * (1 + m.mods.manaRegenPct);
      s.mana = Math.min(def.maxMana + m.mods.maxManaFlat, s.mana + regen * sim.dt);
    }
    if (def.id === 'berserker') tickRage(m, sim.dt);
    if (m.dash.charges < maxDashCharges(m) && ++m.dash.recharge >= dashRechargeTicks(m)) {
      m.dash.charges++;
      m.dash.recharge = 0;
    }
    if (m.health.sinceHit < 1e6) m.health.sinceHit++;
    if (i !== p.active && !m.ko) {
      m.health.hp = Math.min(
        m.health.max,
        m.health.hp + m.health.max * TEAM.reserveRegenPerSecond * sim.dt,
      );
    }
  });
}

/**
 * The active character dropped to 0 HP. Returns true if another member took
 * over (the run goes on), false if the whole party is down.
 */
export function handleCharacterDown(sim: Sim): boolean {
  const p = party(sim);
  const down = activeMember(sim);
  // Relic "Plume de phénix": the first KO of each floor doesn't happen.
  if (hasFlag(sim, 'phoenixFeather') && !p.phoenixUsed) {
    p.phoenixUsed = true;
    down.health.hp = Math.round(down.health.max * 0.3);
    down.health.invuln = TEAM.koSwitchInvulnTicks;
    const pt = sim.world.req(sim.player, 'transform');
    sim.events.push({ type: 'revive', classIds: [down.classId], x: pt.x, y: pt.y });
    return true;
  }
  down.ko = true;
  down.health.hp = 0;
  down.health.shield = 0;
  const t = sim.world.req(sim.player, 'transform');
  sim.events.push({ type: 'ko', classId: down.classId, x: t.x, y: t.y });
  // Next alive member, preferring ones not locked out.
  const order = [1, 2].map((k) => (p.active + k) % p.members.length);
  const next = order.find((i) => !p.members[i]?.ko);
  if (next === undefined) return false;
  switchTo(sim, next, true);
  return true;
}

export function koMembers(sim: Sim): Character[] {
  return party(sim).members.filter((m) => m.ko);
}

/** Brings KO'd members back with a fraction of their max HP. */
export function reviveAll(sim: Sim, fraction: number): Character[] {
  const revived = koMembers(sim);
  for (const m of revived) {
    m.ko = false;
    m.health.hp = Math.max(1, Math.round(m.health.max * fraction));
    m.lockout = 0;
  }
  if (revived.length > 0) {
    const t = sim.world.req(sim.player, 'transform');
    sim.events.push({ type: 'revive', classIds: revived.map((m) => m.classId), x: t.x, y: t.y });
  }
  return revived;
}
