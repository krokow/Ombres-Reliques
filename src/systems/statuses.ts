import { STATUSES, type StatusDef, type StatusId } from '../data/statuses';
import type { GameWorld } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Sim } from '../game/sim';
import { dealDamage } from './damage';

/** Applies or refreshes a status (re-applying keeps the longer duration). */
export function applyStatus(
  sim: Sim,
  e: Entity,
  id: StatusId,
  ticks: number,
  source: Entity | null = null,
): void {
  const set = sim.world.get(e, 'statuses');
  if (!set) return;
  const existing = set.list.find((s) => s.id === id);
  if (existing) {
    existing.ticks = Math.max(existing.ticks, ticks);
    existing.source = source ?? existing.source;
    return;
  }
  const def: StatusDef = STATUSES[id];
  set.list.push({ id, ticks, source, dotTimer: def.dot?.intervalTicks ?? 0 });
  sim.events.push({ type: 'status', target: e, id });
}

export function hasStatus(world: GameWorld, e: Entity, id: StatusId): boolean {
  return world.get(e, 'statuses')?.list.some((s) => s.id === id) ?? false;
}

export function removeStatus(world: GameWorld, e: Entity, id: StatusId): void {
  const set = world.get(e, 'statuses');
  if (set) set.list = set.list.filter((s) => s.id !== id);
}

function product(world: GameWorld, e: Entity, pick: (d: StatusDef) => number | undefined): number {
  let m = 1;
  for (const s of world.get(e, 'statuses')?.list ?? []) m *= pick(STATUSES[s.id]) ?? 1;
  return m;
}

export function moveMultiplier(world: GameWorld, e: Entity): number {
  return product(world, e, (d) => d.moveMult);
}

export function damageTakenMultiplier(world: GameWorld, e: Entity): number {
  return product(world, e, (d) => d.damageTakenMult);
}

export function isStunned(world: GameWorld, e: Entity): boolean {
  return world.get(e, 'statuses')?.list.some((s) => (STATUSES[s.id] as StatusDef).stuns) ?? false;
}

/** Counts statuses down and applies damage over time. */
export function tickStatuses(sim: Sim): void {
  const w = sim.world;
  for (const [e, set] of w.query('statuses')) {
    for (const s of set.list) {
      s.ticks--;
      const dot = (STATUSES[s.id] as StatusDef).dot;
      if (dot && --s.dotTimer <= 0) {
        s.dotTimer = dot.intervalTicks;
        const t = w.get(e, 'transform');
        dealDamage(sim, e, {
          amount: dot.damage,
          source: s.source,
          byPlayer: s.source === sim.player,
          crit: false,
          backstab: false,
          dirX: 0,
          dirY: 0,
          knockback: 0,
          stagger: 0,
          dot: true,
          originX: t?.x ?? 0,
          originY: t?.y ?? 0,
        });
        if (!w.isAlive(e) || w.isPendingDestroy(e)) break;
      }
    }
    set.list = set.list.filter((s) => s.ticks > 0);
  }
}
