import { BERSERKER as DEF } from '../data/classes';
import type { Character, PlayerState } from '../ecs/components';
import type { Sim } from '../game/sim';
import { activeMember } from './progression';

/** Berserker rage: shared by the kit, the damage pipeline and the party tick. */

export function gainRage(sim: Sim, amount: number): void {
  const m = activeMember(sim);
  if (!m || m.classId !== 'berserker' || amount <= 0) return;
  const s = m.state;
  s.rage = Math.min(DEF.rage.max, s.rage + amount * (1 + m.mods.rageGainPct));
  s.rageIdle = 0;
}

/** Decay out of combat; frenzy locks rage at max. Runs for active and reserve alike. */
export function tickRage(m: Character, dt: number): void {
  const s = m.state;
  if (s.frenzy > 0) {
    s.frenzy--;
    s.rage = DEF.rage.max;
    return;
  }
  if (++s.rageIdle < DEF.rage.decayDelayTicks) return;
  const decay = DEF.rage.decayPerSecond * (1 - Math.min(0.9, m.mods.rageDecayReduction));
  s.rage = Math.max(0, s.rage - decay * dt);
}

function rageFraction(s: PlayerState): number {
  return s.rage / DEF.rage.max;
}

/** Outgoing damage multiplier of the berserker (rage + "Sang chaud" when badly hurt). */
export function berserkerDamageMult(sim: Sim): number {
  const s = sim.world.get(sim.player, 'player');
  const h = sim.world.get(sim.player, 'health');
  if (!s || !h || s.classId !== 'berserker') return 1;
  const low = h.hp / h.max < DEF.passive.lowHpThreshold ? DEF.passive.lowHpDamageMult : 1;
  return (1 + rageFraction(s) * DEF.rage.maxDamageBonus) * low;
}

/** Extra lifesteal from rage and frenzy. */
export function berserkerLifesteal(sim: Sim): number {
  const s = sim.world.get(sim.player, 'player');
  if (!s || s.classId !== 'berserker') return 0;
  return rageFraction(s) * DEF.rage.maxLifesteal + (s.frenzy > 0 ? DEF.ultimate.lifesteal : 0);
}

export function inFrenzy(sim: Sim): boolean {
  const s = sim.world.get(sim.player, 'player');
  return s?.classId === 'berserker' && s.frenzy > 0;
}
