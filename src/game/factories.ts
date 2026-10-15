import { CLASSES, type ClassId } from '../data/classes';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { transformAt, type Hitbox } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Sim } from './sim';

export function spawnPlayer(sim: Sim, classId: ClassId, x: number, y: number): Entity {
  const w = sim.world;
  const def = CLASSES[classId];
  const e = w.create();
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'velocity', { x: 0, y: 0 });
  w.add(e, 'impulse', { x: 0, y: 0 });
  w.add(e, 'body', { radius: def.radius, solid: true, pushable: true, weight: def.weight });
  w.add(e, 'facing', { angle: 0 });
  w.add(e, 'team', 'player');
  w.add(e, 'health', { hp: def.maxHp, max: def.maxHp, invuln: 0, stagger: 0 });
  w.add(e, 'mover', { ...def.mover });
  w.add(e, 'buffer', { attack: 0, ranged: 0, dash: 0 });
  w.add(e, 'dash', { charges: def.dash.maxCharges, recharge: 0, active: 0, dirX: 1, dirY: 0 });
  w.add(e, 'combo', { index: 0, tick: -1, idleTicks: 0, hitbox: null });
  w.add(e, 'player', { classId, rangedCooldown: 0, energy: 0, kills: 0 });
  w.add(e, 'renderable', { kind: classId });
  return e;
}

export function spawnEnemy(sim: Sim, id: EnemyId, x: number, y: number): Entity {
  const w = sim.world;
  const def = ENEMIES[id];
  const e = w.create();
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'velocity', { x: 0, y: 0 });
  w.add(e, 'impulse', { x: 0, y: 0 });
  w.add(e, 'body', { radius: def.radius, solid: true, pushable: true, weight: def.weight });
  w.add(e, 'facing', { angle: sim.rng.spawn.range(-Math.PI, Math.PI) });
  w.add(e, 'team', 'enemy');
  w.add(e, 'health', { hp: def.maxHp, max: def.maxHp, invuln: 0, stagger: 0 });
  w.add(e, 'mover', { ...def.mover });
  // Small random initial cooldown so a wave doesn't attack in lockstep.
  w.add(e, 'enemy', {
    defId: id,
    phase: 'chase',
    phaseTicks: 0,
    cooldown: sim.rng.spawn.int(0, def.cooldownTicks),
  });
  w.add(e, 'renderable', { kind: id });
  return e;
}

type HitboxSpec = Omit<Hitbox, 'hit'>;

export function spawnHitbox(sim: Sim, x: number, y: number, spec: HitboxSpec): Entity {
  const w = sim.world;
  const e = w.create();
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'hitbox', { ...spec, hit: new Set() });
  return e;
}

export function spawnShuriken(
  sim: Sim,
  owner: Entity,
  x: number,
  y: number,
  angle: number,
): Entity {
  const w = sim.world;
  const player = w.req(owner, 'player');
  const def = CLASSES[player.classId].ranged;
  const e = spawnHitbox(sim, x, y, {
    owner,
    team: 'player',
    shape: { kind: 'circle', radius: def.radius, offset: 0 },
    angle,
    damage: def.damage,
    knockback: def.knockback,
    stagger: def.stagger,
    delay: 0,
    ticks: def.lifetimeTicks,
    attached: false,
    canCrit: true,
  });
  w.add(e, 'velocity', { x: Math.cos(angle) * def.speed, y: Math.sin(angle) * def.speed });
  w.add(e, 'projectile', { pierceLeft: def.pierce, lifetime: def.lifetimeTicks });
  w.add(e, 'renderable', { kind: 'shuriken' });
  return e;
}
