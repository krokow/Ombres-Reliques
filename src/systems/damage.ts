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
  player.energy = Math.min(CLASSES[player.classId].maxEnergy, player.energy + amount);
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
  if (p.blockTicks <= GUARDIAN.block.parryWindowTicks) {
    if (spec.source !== null && w.has(spec.source, 'enemy')) {
      applyStatus(sim, spec.source, 'stun', GUARDIAN.block.parryStunTicks, sim.player);
    }
    gainEnergy(sim, GUARDIAN.block.parryEnergy);
    sim.events.push({ type: 'parry', x: t.x, y: t.y, angle: facing });
    sim.hitstop(FEEL.hitstop.crit);
    return 0;
  }
  sim.events.push({ type: 'block', x: t.x, y: t.y, angle: facing });
  return 1 - GUARDIAN.block.reduction;
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

  if (spec.byPlayer && !targetIsPlayer) gainEnergy(sim, dealt * playerClass(sim).energyPerDamage);
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
  if (def.dash.refundOnKill > 0 && dash.charges < def.dash.maxCharges) {
    dash.charges = Math.min(def.dash.maxCharges, dash.charges + def.dash.refundOnKill);
    dash.recharge = 0;
    const t = w.req(sim.player, 'transform');
    sim.events.push({ type: 'dashRefund', x: t.x, y: t.y });
  }
  sim.hitstop(FEEL.hitstop.kill);
}
