import { CLASSES, SHADOW_BLADE, SUMMONER, type ClassId } from '../data/classes';
import type { StatusApplication } from '../data/statuses';
import { emptyMods } from '../data/mods';
import { LOOT, RELICS, type RelicId } from '../data/items';
import { NO_BONUSES } from '../data/meta';
import { difficultyFor } from '../data/dungeon';
import { ELITE, ELITE_MODIFIERS, type EliteModifierId } from '../data/elites';
import { enemyDef, type EnemyId } from '../data/enemies';
import {
  transformAt,
  type BurstSpec,
  type Character,
  type Hitbox,
  type Team,
  type Zone,
} from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Sim } from './sim';

export function newCharacter(classId: ClassId): Character {
  const def = CLASSES[classId];
  return {
    classId,
    ko: false,
    lockout: 0,
    state: {
      classId,
      primaryCooldown: 0,
      rangedCooldown: 0,
      skillCooldown: 0,
      energy: 0,
      mana: def.id === 'arcanist' ? def.maxMana : 0,
      inVeil: false,
      execution: null,
      blockTicks: -1,
      boltCount: 0,
      meteors: null,
      rage: 0,
      rageIdle: 0,
      frenzy: 0,
      spin: 0,
    },
    health: { hp: def.maxHp, max: def.maxHp, shield: 0, sinceHit: 9999, invuln: 0, stagger: 0 },
    dash: { charges: def.dash.maxCharges, recharge: 0, active: 0, dirX: 1, dirY: 0 },
    combo: { index: 0, tick: -1, idleTicks: 0, hitbox: null },
    statuses: { list: [] },
    progress: {
      level: 1,
      xp: 0,
      pendingCards: 0,
      offer: null,
      talentPoints: 0,
      talents: [],
      cards: {},
    },
    equipment: { weapon: null, armor: null, relic: null },
    scars: 0,
    mods: emptyMods(),
    flags: new Set(),
  };
}

/**
 * The player is one entity whose character-specific components (health,
 * dash, combo, statuses, player state) are swapped when switching: systems
 * and enemies keep a single stable target.
 */
export function spawnPlayer(sim: Sim, party: readonly ClassId[], x: number, y: number): Entity {
  const w = sim.world;
  const members = party.map(newCharacter);
  const first = members[0];
  if (!first) throw new Error('Empty party');
  const def = CLASSES[first.classId];
  const e = w.create();
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'velocity', { x: 0, y: 0 });
  w.add(e, 'impulse', { x: 0, y: 0 });
  w.add(e, 'body', { radius: def.radius, solid: true, pushable: true, weight: def.weight });
  w.add(e, 'facing', { angle: 0 });
  w.add(e, 'team', 'player');
  w.add(e, 'mover', { ...def.mover });
  w.add(e, 'buffer', {
    attack: 0,
    ranged: 0,
    dash: 0,
    skill: 0,
    ultimate: 0,
    switchSlot: -1,
    switchTicks: 0,
  });
  w.add(e, 'party', {
    members,
    active: 0,
    switchCooldown: 0,
    kills: 0,
    gold: 0,
    keys: LOOT.startingKeys,
    quick: Array.from({ length: LOOT.quickSlots }, () => null),
    relics: [],
    phoenixUsed: false,
    bonuses: { ...NO_BONUSES },
    relicPool: Object.keys(RELICS) as RelicId[],
  });
  w.add(e, 'player', first.state);
  w.add(e, 'health', first.health);
  w.add(e, 'dash', first.dash);
  w.add(e, 'combo', first.combo);
  w.add(e, 'statuses', first.statuses);
  w.add(e, 'renderable', { kind: first.classId });
  return e;
}

export interface SpawnEnemyOptions {
  elite?: readonly EliteModifierId[];
  summoner?: Entity;
  /** Knows where the player is from the start (arena waves). Default true. */
  alert?: boolean;
  /** Dungeon floor, for HP/damage scaling (default 1). */
  level?: number;
}

export function spawnEnemy(
  sim: Sim,
  id: EnemyId,
  x: number,
  y: number,
  opts: SpawnEnemyOptions = {},
): Entity {
  const w = sim.world;
  const def = enemyDef(id);
  const mods = opts.elite ?? [];
  const isElite = mods.length > 0;
  const level = opts.level ?? 1;
  const diff = difficultyFor(level);
  let hp = def.maxHp * (isElite ? ELITE.hpMult : 1) * diff.hpMult;
  let weight = def.weight;
  let speedMult = 1;
  let damageMult = diff.damageMult;
  const elite = { mods: [...mods], lifesteal: 0, explodesOnDeath: false };
  for (const m of mods) {
    const mod: {
      hpMult?: number;
      speedMult?: number;
      damageMult?: number;
      weightMult?: number;
      lifesteal?: number;
      explodesOnDeath?: boolean;
    } = ELITE_MODIFIERS[m];
    hp *= mod.hpMult ?? 1;
    weight *= mod.weightMult ?? 1;
    speedMult *= mod.speedMult ?? 1;
    damageMult *= mod.damageMult ?? 1;
    elite.lifesteal += mod.lifesteal ?? 0;
    elite.explodesOnDeath ||= mod.explodesOnDeath ?? false;
  }
  hp = Math.round(hp);

  const e = w.create();
  const pt = w.get(sim.player, 'transform');
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'velocity', { x: 0, y: 0 });
  w.add(e, 'impulse', { x: 0, y: 0 });
  w.add(e, 'body', {
    radius: def.radius * (isElite ? ELITE.radiusMult : 1),
    solid: true,
    pushable: true,
    weight,
  });
  w.add(e, 'facing', { angle: sim.rng.spawn.range(-Math.PI, Math.PI) });
  w.add(e, 'team', 'enemy');
  w.add(e, 'health', { hp, max: hp, shield: 0, sinceHit: 9999, invuln: 0, stagger: 0 });
  w.add(e, 'statuses', { list: [] });
  w.add(e, 'mover', { ...def.mover });
  const alert = opts.alert ?? true;
  w.add(e, 'enemy', {
    defId: id,
    phase: alert ? 'chase' : 'idle',
    phaseTicks: 0,
    // Small random initial cooldown so a wave doesn't attack in lockstep.
    cooldown: sim.rng.spawn.int(0, 'cooldownTicks' in def ? def.cooldownTicks : 30),
    alert,
    lastKnownX: pt?.x ?? x,
    lastKnownY: pt?.y ?? y,
    aimX: x,
    aimY: y,
    blind: false,
    path: [],
    pathGoal: -1,
    repath: 0,
    damageMult,
    speedMult,
  });
  if (isElite) w.add(e, 'elite', elite);
  if (def.behavior === 'boss') {
    w.add(e, 'boss', {
      phase: 0,
      step: 'rest',
      ticks: 0,
      next: 0,
      current: 0,
      aimX: x,
      aimY: y,
      dirX: 1,
      dirY: 0,
    });
  }
  if (opts.summoner !== undefined) w.add(e, 'minion', { summoner: opts.summoner });
  w.add(e, 'renderable', { kind: id });
  return e;
}

type HitboxSpec = Omit<Hitbox, 'hit' | 'statuses' | 'creditPlayer' | 'sourceClass' | 'leavesFire'> &
  Partial<Pick<Hitbox, 'statuses' | 'creditPlayer' | 'sourceClass' | 'leavesFire'>>;

export function spawnHitbox(sim: Sim, x: number, y: number, spec: HitboxSpec): Entity {
  const w = sim.world;
  const e = w.create();
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'hitbox', {
    statuses: [],
    creditPlayer: false,
    sourceClass: null,
    leavesFire: false,
    ...spec,
    hit: new Set(),
  });
  return e;
}

export interface PlayerProjectileSpec {
  damage: number;
  speed: number;
  radius: number;
  lifetimeTicks: number;
  knockback: number;
  pierce: number;
  stagger: number;
  kind: 'shuriken' | 'arcaneBolt' | 'frostOrb' | 'axe';
  burst?: BurstSpec;
  statuses?: readonly StatusApplication[];
}

export function spawnPlayerProjectile(
  sim: Sim,
  owner: Entity,
  x: number,
  y: number,
  angle: number,
  spec: PlayerProjectileSpec,
): Entity {
  const w = sim.world;
  const classId = w.get(owner, 'player')?.classId ?? null;
  const e = spawnHitbox(sim, x, y, {
    owner,
    team: 'player',
    shape: { kind: 'circle', radius: spec.radius, offset: 0 },
    angle,
    damage: spec.damage,
    knockback: spec.knockback,
    stagger: spec.stagger,
    delay: 0,
    ticks: spec.lifetimeTicks,
    attached: false,
    canCrit: true,
    sourceClass: classId,
    statuses: spec.statuses ?? [],
  });
  w.add(e, 'velocity', { x: Math.cos(angle) * spec.speed, y: Math.sin(angle) * spec.speed });
  w.add(e, 'projectile', {
    pierceLeft: spec.pierce,
    lifetime: spec.lifetimeTicks,
    burst: spec.burst ?? null,
  });
  w.add(e, 'renderable', { kind: spec.kind });
  return e;
}

export function spawnShuriken(
  sim: Sim,
  owner: Entity,
  x: number,
  y: number,
  angle: number,
): Entity {
  return spawnPlayerProjectile(sim, owner, x, y, angle, {
    ...SHADOW_BLADE.ranged,
    kind: 'shuriken',
  });
}

export interface EnemyProjectileSpec {
  damage: number;
  speed: number;
  radius: number;
  lifetimeTicks: number;
  knockback: number;
  slowTicks: number;
}

export function spawnEnemyProjectile(
  sim: Sim,
  owner: Entity,
  x: number,
  y: number,
  angle: number,
  spec: EnemyProjectileSpec,
  damageMult: number,
): Entity {
  const w = sim.world;
  const e = spawnHitbox(sim, x, y, {
    owner,
    team: 'enemy',
    shape: { kind: 'circle', radius: spec.radius, offset: 0 },
    angle,
    damage: Math.round(spec.damage * damageMult),
    knockback: spec.knockback,
    stagger: 0,
    delay: 0,
    ticks: spec.lifetimeTicks,
    attached: false,
    canCrit: false,
    statuses: spec.slowTicks > 0 ? [{ id: 'slow', ticks: spec.slowTicks }] : [],
  });
  w.add(e, 'velocity', { x: Math.cos(angle) * spec.speed, y: Math.sin(angle) * spec.speed });
  w.add(e, 'projectile', { pierceLeft: 0, lifetime: spec.lifetimeTicks, burst: null });
  w.add(e, 'renderable', { kind: 'boneArrow' });
  return e;
}

export interface ExplosionSpec {
  radius: number;
  damage: number;
  knockback: number;
  delayTicks: number;
  poisonTicks?: number;
  creditPlayer: boolean;
  /** Default 'neutral' (hurts everyone); player spells use 'player'. */
  team?: Team;
  statuses?: readonly StatusApplication[];
  sourceClass?: ClassId | null;
  leavesFire?: boolean;
}

/** Neutral area damage: hurts players and enemies alike, telegraphed while `delay` runs. */
export function spawnExplosion(
  sim: Sim,
  owner: Entity,
  x: number,
  y: number,
  spec: ExplosionSpec,
): Entity {
  const e = spawnHitbox(sim, x, y, {
    owner,
    team: spec.team ?? 'neutral',
    shape: { kind: 'circle', radius: spec.radius, offset: 0 },
    angle: 0,
    damage: spec.damage,
    knockback: spec.knockback,
    stagger: 12,
    delay: spec.delayTicks,
    ticks: 1,
    attached: false,
    canCrit: spec.team === 'player',
    statuses: [
      ...(spec.poisonTicks ? [{ id: 'poison' as const, ticks: spec.poisonTicks }] : []),
      ...(spec.statuses ?? []),
    ],
    creditPlayer: spec.creditPlayer,
    sourceClass: spec.sourceClass ?? null,
    leavesFire: spec.leavesFire ?? false,
  });
  sim.world.add(e, 'renderable', { kind: 'explosion' });
  return e;
}

export function spawnZone(
  sim: Sim,
  kind: Zone['kind'],
  owner: Entity,
  x: number,
  y: number,
  radius: number,
  ticks: number,
): Entity {
  const w = sim.world;
  const e = w.create();
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'zone', { kind, radius, ticks, maxTicks: ticks, owner });
  return e;
}

export function spawnSmoke(
  sim: Sim,
  owner: Entity,
  x: number,
  y: number,
  radius: number,
  ticks: number,
): Entity {
  return spawnZone(sim, 'smoke', owner, x, y, radius, ticks);
}

/** Invocateur summons: allied bodies that fight on their own (see systems/allies). */
export function spawnAlly(
  sim: Sim,
  kind: 'wisp' | 'colossus',
  x: number,
  y: number,
  opts: { lifePct: number; damagePct: number },
): Entity {
  const w = sim.world;
  const def = kind === 'wisp' ? SUMMONER.wisp : SUMMONER.colossus;
  const e = w.create();
  const life = Math.round(def.lifeTicks * (1 + opts.lifePct));
  w.add(e, 'transform', transformAt(x, y));
  w.add(e, 'velocity', { x: 0, y: 0 });
  w.add(e, 'impulse', { x: 0, y: 0 });
  w.add(e, 'body', { radius: def.radius, solid: true, pushable: true, weight: def.weight });
  w.add(e, 'facing', { angle: sim.rng.combat.range(-Math.PI, Math.PI) });
  w.add(e, 'team', 'player');
  w.add(e, 'health', {
    hp: def.maxHp,
    max: def.maxHp,
    shield: 0,
    sinceHit: 9999,
    invuln: 10,
    stagger: 0,
  });
  w.add(e, 'statuses', { list: [] });
  w.add(e, 'mover', { ...def.mover });
  w.add(e, 'ally', {
    kind,
    life,
    maxLife: life,
    cooldown: sim.rng.combat.int(0, 20),
    windup: -1,
    target: null,
    rush: 0,
    lost: 0,
    damageMult: 1 + opts.damagePct,
  });
  w.add(e, 'renderable', { kind });
  sim.events.push({ type: 'allySummon', kind, x, y });
  return e;
}
