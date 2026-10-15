import { angleDiff } from '../core/math';
import type { Rng } from '../core/rng';
import type { HitShape } from '../ecs/components';

/** True if the attacker stands inside the target's rear cone. */
export function isBehind(
  targetX: number,
  targetY: number,
  targetFacing: number,
  attackerX: number,
  attackerY: number,
  rearHalfArc: number,
): boolean {
  const toAttacker = Math.atan2(attackerY - targetY, attackerX - targetX);
  return Math.abs(angleDiff(targetFacing + Math.PI, toAttacker)) <= rearHalfArc;
}

export interface DamageStats {
  critChance: number;
  critMultiplier: number;
  backstabMultiplier: number;
}

export interface DamageRoll {
  amount: number;
  crit: boolean;
}

/**
 * Backstabs are guaranteed crits using the backstab multiplier (no stacking
 * with the regular crit multiplier, to keep burst readable and balanceable).
 */
export function rollDamage(
  base: number,
  stats: DamageStats | null,
  backstab: boolean,
  rng: Rng,
): DamageRoll {
  if (!stats) return { amount: Math.round(base), crit: false };
  if (backstab) return { amount: Math.round(base * stats.backstabMultiplier), crit: true };
  const crit = rng.chance(stats.critChance);
  return { amount: Math.round(crit ? base * stats.critMultiplier : base), crit };
}

/** Overlap test between a hit shape (at origin, facing `angle`) and a circular hurtbox. */
export function shapeHitsCircle(
  shape: HitShape,
  ox: number,
  oy: number,
  angle: number,
  tx: number,
  ty: number,
  tr: number,
): boolean {
  if (shape.kind === 'circle') {
    const cx = ox + Math.cos(angle) * shape.offset;
    const cy = oy + Math.sin(angle) * shape.offset;
    const r = shape.radius + tr;
    return (tx - cx) ** 2 + (ty - cy) ** 2 <= r * r;
  }
  const d = Math.hypot(tx - ox, ty - oy);
  if (d > shape.range + tr) return false;
  if (d <= tr) return true;
  // Widen the cone by the target's angular radius so edge grazes still count.
  const angularRadius = Math.asin(Math.min(1, tr / d));
  return Math.abs(angleDiff(angle, Math.atan2(ty - oy, tx - ox))) <= shape.arc / 2 + angularRadius;
}
