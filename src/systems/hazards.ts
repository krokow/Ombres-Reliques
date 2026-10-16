import { difficultyFor } from '../data/dungeon';
import { HAZARD_PLACEMENT, HAZARDS, type HazardDef, type HazardId } from '../data/hazards';
import type { Floor } from '../dungeon/floor';
import { transformAt, type Trap } from '../ecs/components';
import { spawnHitbox } from '../game/factories';
import type { Sim } from '../game/sim';

export type TrapPhase = 'idle' | 'warn' | 'active';

export function trapPhase(trap: Trap): { phase: TrapPhase; t: number } {
  const def: HazardDef = HAZARDS[trap.kind];
  const activeStart = def.periodTicks - def.activeTicks;
  const warnStart = activeStart - def.warnTicks;
  if (trap.timer >= activeStart)
    return { phase: 'active', t: (trap.timer - activeStart) / def.activeTicks };
  if (trap.timer >= warnStart)
    return { phase: 'warn', t: (trap.timer - warnStart) / def.warnTicks };
  return { phase: 'idle', t: 0 };
}

/** Places this floor's traps in combat rooms (seeded, loot stream). */
export function setupFloorTraps(sim: Sim, floor: Floor): void {
  const rng = sim.rng.loot;
  const p = HAZARD_PLACEMENT;
  const kind: HazardId = p.byBiome[floor.biome];
  const { map } = floor;
  const s = map.tileSize;
  for (const room of floor.rooms) {
    if (room.type !== 'combat' || room.id === floor.startRoom || !rng.chance(p.roomChance))
      continue;
    const n = Math.min(p.max, p.base + Math.floor(floor.level / p.perFloors));
    const tiles: { tx: number; ty: number }[] = [];
    for (let i = 0; i < floor.roomAt.length; i++) {
      if (floor.roomAt[i] !== room.id) continue;
      const tx = i % map.width;
      const ty = (i - tx) / map.width;
      if (map.isSolid(tx, ty)) continue;
      const nearDoor = room.doors.some(
        (d) => Math.abs(d.tx - tx) + Math.abs(d.ty - ty) <= p.doorClearance,
      );
      const nearCenter =
        Math.abs(room.center.tx - tx) <= p.centerClearance &&
        Math.abs(room.center.ty - ty) <= p.centerClearance;
      if (!nearDoor && !nearCenter) tiles.push({ tx, ty });
    }
    rng.shuffle(tiles);
    for (const tile of tiles.slice(0, n)) {
      const e = sim.world.create();
      const c = { x: (tile.tx + 0.5) * s, y: (tile.ty + 0.5) * s };
      sim.world.add(e, 'transform', transformAt(c.x, c.y));
      // Desynchronised so a room isn't one big metronome.
      sim.world.add(e, 'trap', { kind, timer: rng.int(0, HAZARDS[kind].periodTicks - 1) });
    }
  }
}

/** Advances every trap; an active window spawns a neutral hitbox (hurts everyone). */
export function updateTraps(sim: Sim): void {
  const mult = difficultyFor(sim.level, sim.difficulty).damageMult;
  const pt = sim.world.get(sim.player, 'transform');
  for (const [e, trap, t] of sim.world.query('trap', 'transform')) {
    const def: HazardDef = HAZARDS[trap.kind];
    trap.timer = (trap.timer + 1) % def.periodTicks;
    if (trap.timer !== def.periodTicks - def.activeTicks) continue;
    spawnHitbox(sim, t.x, t.y, {
      owner: e,
      team: 'neutral',
      shape: { kind: 'circle', radius: def.radius, offset: 0 },
      angle: 0,
      damage: Math.round(def.damage * mult),
      knockback: def.knockback,
      stagger: 8,
      delay: 0,
      ticks: def.activeTicks,
      attached: false,
      canCrit: false,
      statuses: def.statuses,
      creditPlayer: true,
    });
    // Feedback only for traps near the player (no sound from across the map).
    if (pt && Math.hypot(pt.x - t.x, pt.y - t.y) < 520)
      sim.events.push({ type: 'trap', kind: trap.kind, x: t.x, y: t.y });
  }
}
