import { angleDiff } from '../core/math';
import { CLASSES, GUARDIAN } from '../data/classes';
import { FEEL } from '../data/combat';
import { ELITE } from '../data/elites';
import { enemyDef } from '../data/enemies';
import type { Entity } from '../ecs/world';
import { spawnExplosion } from '../game/factories';
import type { Sim } from '../game/sim';
import { applyStatus, damageDealtMultiplier, damageTakenMultiplier } from './statuses';
import { handleCharacterDown } from './team';
import { enemiesAround } from './player';
import { activeMods, awardKillXp, hasFlag, maxDashCharges } from './progression';

export interface DamageSpec {
  amount: number;
  source: Entity | null;
  byPlayer: boolean;
  crit: boolean;
  backstab: boolean;
  /** Knockback direction (unit vector). */
  dirX: number;
  dirY: number;
  knockback: number;
  stagger: number;
  /** Damage over time: no hit-stop, no i-frames, can't be blocked. */
  dot: boolean;
  originX: number;
  originY: number;
}

function playerClass(sim: Sim): (typeof CLASSES)[keyof typeof CLASSES] {
  return CLASSES[sim.world.req(sim.player, 'player').classId];
}

function gainEnergy(sim: Sim, amount: number): void {
  const player = sim.world.get(sim.player, 'player');
  if (!player) return;
  const gain = amount * (1 + activeMods(sim).energyGainPct);
  player.energy = Math.min(CLASSES[player.classId].maxEnergy, player.energy + gain);
}

/** Radial stagger blast around the player (parry counter, earthshaker…). */
export function playerBlast(
  sim: Sim,
  radius: number,
  damage: number,
  knockback: number,
  stagger: number,
): void {
  const t = sim.world.req(sim.player, 'transform');
  for (const e of enemiesAround(sim, t.x, t.y, radius)) {
    const et = sim.world.req(e, 'transform');
    const a = Math.atan2(et.y - t.y, et.x - t.x);
    dealDamage(sim, e, {
      amount: damage,
      source: sim.player,
      byPlayer: true,
      crit: false,
      backstab: false,
      dirX: Math.cos(a),
      dirY: Math.sin(a),
      knockback,
      stagger,
      dot: false,
      originX: t.x,
      originY: t.y,
    });
  }
  sim.events.push({ type: 'shockwave', x: t.x, y: t.y, radius, color: 'gold' });
}

/**
 * Guardian's shield: frontal hits are reduced, or fully parried (attacker
 * stunned) when the shield went up just before. Returns the damage factor.
 */
function blockFactor(sim: Sim, spec: DamageSpec): number {
  const w = sim.world;
  const p = w.get(sim.player, 'player');
  if (!p || p.classId !== 'guardian' || p.blockTicks < 0 || spec.dot) return 1;
  const t = w.req(sim.player, 'transform');
  const facing = w.req(sim.player, 'facing').angle;
  const toOrigin = Math.atan2(spec.originY - t.y, spec.originX - t.x);
  if (Math.abs(angleDiff(facing, toOrigin)) > GUARDIAN.block.arc / 2) return 1;
  const mods = activeMods(sim);
  if (p.blockTicks <= GUARDIAN.block.parryWindowTicks + mods.parryWindowBonus) {
    if (spec.source !== null && w.has(spec.source, 'enemy')) {
      applyStatus(sim, spec.source, 'stun', GUARDIAN.block.parryStunTicks, sim.player);
    }
    gainEnergy(sim, GUARDIAN.block.parryEnergy);
    sim.events.push({ type: 'parry', x: t.x, y: t.y, angle: facing });
    sim.hitstop(FEEL.hitstop.crit);
    if (hasFlag(sim, 'parryNova')) playerBlast(sim, 80, 10, 300, 25);
    return 0;
  }
  sim.events.push({ type: 'block', x: t.x, y: t.y, angle: facing });
  const reduction = Math.min(0.95, GUARDIAN.block.reduction + mods.blockReductionBonus);
  // Thorns: half of what the shield stopped goes back to the attacker.
  if (hasFlag(sim, 'thorns') && spec.source !== null && w.has(spec.source, 'enemy')) {
    const st = w.get(spec.source, 'transform');
    if (st) {
      dealDamage(sim, spec.source, {
        amount: spec.amount * reduction * 0.5,
        source: sim.player,
        byPlayer: true,
        crit: false,
        backstab: false,
        dirX: Math.cos(toOrigin),
        dirY: Math.sin(toOrigin),
        knockback: 80,
        stagger: 6,
        dot: false,
        originX: t.x,
        originY: t.y,
      });
    }
  }
  return 1 - reduction;
}

/**
 * Single entry point for all damage (hits, DoT, explosions, ultimates):
 * multipliers, shields, blocking, knockback, feel, rewards and death are
 * handled here once. Returns the HP damage actually dealt.
 */
export function dealDamage(sim: Sim, target: Entity, spec: DamageSpec): number {
  const w = sim.world;
  const th = w.get(target, 'health');
  const tt = w.get(target, 'transform');
  if (!th || !tt || th.hp <= 0 || w.isPendingDestroy(target)) return 0;
  const targetIsPlayer = target === sim.player;

  let factor = damageTakenMultiplier(w, target);
  if (spec.byPlayer && !targetIsPlayer) factor *= 1 + activeMods(sim).damagePct;
  if (spec.source !== null && w.isAlive(spec.source))
    factor *= damageDealtMultiplier(w, spec.source);
  let knockback = spec.knockback;
  if (targetIsPlayer) {
    const block = blockFactor(sim, spec);
    if (block === 0) return 0;
    if (block < 1) knockback *= 0.3;
    factor *= block;
  }
  const amount = Math.max(1, Math.round(spec.amount * factor));
  const total = targetIsPlayer && sim.godMode ? 0 : amount;
  const absorbed = Math.min(th.shield, total);
  th.shield -= absorbed;
  const dealt = Math.min(th.hp, total - absorbed);
  th.hp -= dealt;
  th.sinceHit = 0;

  const imp = w.get(target, 'impulse');
  const weight = w.get(target, 'body')?.weight ?? 1;
  if (imp && knockback > 0) {
    imp.x += (spec.dirX * knockback) / weight;
    imp.y += (spec.dirY * knockback) / weight;
  }
  th.stagger = Math.max(th.stagger, spec.stagger);

  sim.events.push({
    type: 'hit',
    target,
    x: tt.x,
    y: tt.y,
    damage: amount,
    crit: spec.crit,
    backstab: spec.backstab,
    dirX: spec.dirX,
    dirY: spec.dirY,
    byPlayer: spec.byPlayer,
    dot: spec.dot,
    absorbed,
  });

  if (spec.byPlayer && !targetIsPlayer) {
    gainEnergy(sim, dealt * playerClass(sim).energyPerDamage);
    const leech = activeMods(sim).lifesteal;
    const ph = w.get(sim.player, 'health');
    if (leech > 0 && ph && ph.hp > 0) ph.hp = Math.min(ph.max, ph.hp + dealt * leech);
  }
  if (targetIsPlayer) gainEnergy(sim, (dealt + absorbed) * playerClass(sim).energyPerDamageTaken);

  if (targetIsPlayer && spec.source !== null) {
    const lifesteal = w.get(spec.source, 'elite')?.lifesteal ?? 0;
    const sh = w.get(spec.source, 'health');
    if (lifesteal > 0 && sh && sh.hp > 0) sh.hp = Math.min(sh.max, sh.hp + dealt * lifesteal);
  }

  if (!spec.dot) {
    if (targetIsPlayer) {
      th.invuln = playerClass(sim).hurtInvulnTicks;
      sim.hitstop(FEEL.hitstop.playerHurt);
    } else if (spec.byPlayer) {
      sim.hitstop(spec.crit ? FEEL.hitstop.crit : FEEL.hitstop.hit);
    }
  }

  if (th.hp <= 0) kill(sim, target, spec.byPlayer);
  return dealt;
}

function kill(sim: Sim, target: Entity, byPlayer: boolean): void {
  const w = sim.world;
  const th = w.req(target, 'health');
  const tt = w.req(target, 'transform');
  th.hp = 0;
  if (target === sim.player) {
    // Another party member takes over; the run only ends when all are down.
    if (handleCharacterDown(sim)) return;
    sim.events.push({ type: 'playerDeath', x: tt.x, y: tt.y });
    return;
  }
  const kind = w.get(target, 'renderable')?.kind ?? 'ghoul';
  sim.events.push({ type: 'kill', target, kind, x: tt.x, y: tt.y, byPlayer });

  const ai = w.get(target, 'enemy');
  if (ai) {
    const def = enemyDef(ai.defId);
    if (def.behavior === 'kamikaze') {
      spawnExplosion(sim, target, tt.x, tt.y, {
        radius: def.explosion.radius,
        damage: Math.round(def.explosion.damage * ai.damageMult),
        knockback: def.explosion.knockback,
        delayTicks: def.deathFuseTicks,
        poisonTicks: def.explosion.poisonTicks,
        creditPlayer: byPlayer,
      });
    } else if (w.get(target, 'elite')?.explodesOnDeath) {
      const ex = ELITE.deathExplosion;
      spawnExplosion(sim, target, tt.x, tt.y, { ...ex, creditPlayer: byPlayer });
    }
  }
  if (byPlayer) awardKillXp(sim, target);
  w.destroy(target);
  if (byPlayer) onPlayerKill(sim);
}

/** Rewards a kill by the player: energy, and the assassin's dash reset. */
export function onPlayerKill(sim: Sim): void {
  const w = sim.world;
  const player = w.get(sim.player, 'player');
  const party = w.get(sim.player, 'party');
  if (!player || !party) return;
  const def = CLASSES[player.classId];
  const dash = w.req(sim.player, 'dash');
  party.kills++;
  gainEnergy(sim, def.energyOnKill);
  const member = party.members[party.active];
  const maxCharges = member ? maxDashCharges(member) : def.dash.maxCharges;
  // Talents: full dash reset (blade), charge reset (guardian).
  const refund =
    hasFlag(sim, 'fullReset') || hasFlag(sim, 'chargeReset') ? maxCharges : def.dash.refundOnKill;
  if (refund > 0 && dash.charges < maxCharges) {
    dash.charges = Math.min(maxCharges, dash.charges + refund);
    dash.recharge = 0;
    const t = w.req(sim.player, 'transform');
    sim.events.push({ type: 'dashRefund', x: t.x, y: t.y });
  }
  if (hasFlag(sim, 'killStealth')) applyStatus(sim, sim.player, 'invisible', 60);
  sim.hitstop(FEEL.hitstop.kill);
}
