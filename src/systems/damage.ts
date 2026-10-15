import { CLASSES } from '../data/classes';
import { FEEL } from '../data/combat';
import { ELITE } from '../data/elites';
import { enemyDef } from '../data/enemies';
import type { Entity } from '../ecs/world';
import { spawnExplosion } from '../game/factories';
import type { Sim } from '../game/sim';
import { damageTakenMultiplier } from './statuses';

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
  /** Damage over time: no hit-stop, no i-frames. */
  dot: boolean;
  originX: number;
  originY: number;
}

/**
 * Single entry point for all damage (hits, DoT, explosions, ultimate):
 * multipliers, knockback, feel, rewards and death are handled here once.
 * Returns the damage actually dealt.
 */
export function dealDamage(sim: Sim, target: Entity, spec: DamageSpec): number {
  const w = sim.world;
  const th = w.get(target, 'health');
  const tt = w.get(target, 'transform');
  if (!th || !tt || th.hp <= 0 || w.isPendingDestroy(target)) return 0;
  const targetIsPlayer = target === sim.player;

  const amount = Math.max(1, Math.round(spec.amount * damageTakenMultiplier(w, target)));
  const dealt = targetIsPlayer && sim.godMode ? 0 : Math.min(th.hp, amount);
  th.hp -= dealt;

  const imp = w.get(target, 'impulse');
  const weight = w.get(target, 'body')?.weight ?? 1;
  if (imp && spec.knockback > 0) {
    imp.x += (spec.dirX * spec.knockback) / weight;
    imp.y += (spec.dirY * spec.knockback) / weight;
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
  });

  if (spec.byPlayer && !targetIsPlayer) gainEnergy(sim, dealt * playerClass(sim).energyPerDamage);

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

function playerClass(sim: Sim): (typeof CLASSES)[keyof typeof CLASSES] {
  return CLASSES[sim.world.req(sim.player, 'player').classId];
}

function gainEnergy(sim: Sim, amount: number): void {
  const player = sim.world.get(sim.player, 'player');
  if (!player) return;
  player.energy = Math.min(CLASSES[player.classId].maxEnergy, player.energy + amount);
}

function kill(sim: Sim, target: Entity, byPlayer: boolean): void {
  const w = sim.world;
  const th = w.req(target, 'health');
  const tt = w.req(target, 'transform');
  th.hp = 0;
  if (target === sim.player) {
    sim.events.push({ type: 'playerDeath', x: tt.x, y: tt.y });
    return;
  }
  const kind = w.get(target, 'renderable')?.kind ?? 'ghoul';
  sim.events.push({ type: 'kill', target, kind, x: tt.x, y: tt.y, byPlayer });

  const ai = w.get(target, 'enemy');
  if (ai) {
    const def = enemyDef(ai.defId);
    const damageMult = w.get(target, 'elite')?.damageMult ?? 1;
    if (def.behavior === 'kamikaze') {
      spawnExplosion(sim, target, tt.x, tt.y, {
        radius: def.explosion.radius,
        damage: Math.round(def.explosion.damage * damageMult),
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

/** Rewards a kill by the player: the assassin's reset loop. */
export function onPlayerKill(sim: Sim): void {
  const w = sim.world;
  const player = w.get(sim.player, 'player');
  if (!player) return;
  const def = CLASSES[player.classId];
  const dash = w.req(sim.player, 'dash');
  player.kills++;
  gainEnergy(sim, def.energyOnKill);
  if (dash.charges < def.dash.maxCharges) {
    dash.charges = Math.min(def.dash.maxCharges, dash.charges + def.dash.refundOnKill);
    dash.recharge = 0;
    const t = w.req(sim.player, 'transform');
    sim.events.push({ type: 'dashRefund', x: t.x, y: t.y });
  }
  sim.hitstop(FEEL.hitstop.kill);
}
