import { Rng } from '../core/rng';
import { TileMap } from '../core/tilemap';
import { TEST_ARENA } from '../data/arenas';
import { biomeForFloor, type BiomeId } from '../data/biomes';
import { CLASSES } from '../data/classes';
import { ENGINE } from '../data/config';
import { DESCEND_HEAL } from '../data/dungeon';
import { TEAM } from '../data/team';
import { RELICS, type RelicId } from '../data/items';
import { NO_BONUSES, type RunBonuses } from '../data/meta';
import type { ClassId } from '../data/classes';
import { generateFloor } from '../dungeon/generate';
import { World } from '../ecs/world';
import type { Components, GameWorld } from '../ecs/components';
import type { Entity } from '../ecs/world';
import { enemyAI } from '../systems/ai';
import { updateAllies } from '../systems/allies';
import { resolveHitboxes, tickInvulnerability, updateProjectiles } from '../systems/combat';
import {
  breakCrackedWalls,
  createDungeonState,
  updateDungeon,
  type DungeonState,
} from '../systems/dungeon';
import { integrateMotion, separateBodies, snapshotTransforms } from '../systems/movement';
import { FlowField } from '../systems/navigation';
import { kitFor } from '../systems/kits';
import { activeClass, playerBuffer, playerMove } from '../systems/player';
import { applyUiAction } from '../systems/actions';
import { interact, setupFloorLoot, updatePickups, useConsumable } from '../systems/loot';
import { handleSwitchInput, install, reviveAll, tickParty } from '../systems/team';
import { maxDashCharges, recomputeAll } from '../systems/progression';
import { emptyStats, trackEvent, type RunStats } from './runStats';
import { snapshotParty, SNAPSHOT_FORMAT, type RunSnapshot } from './snapshot';
import { updateZones } from '../systems/zones';
import { tickStatuses } from '../systems/statuses';
import { updateWaves, type WaveState } from '../systems/waves';
import type { GameEvent } from './events';
import { spawnPlayer } from './factories';
import type { InputFrame } from './inputFrame';
import type { Sim } from './sim';

export interface GameOptions {
  /** 'dungeon' (default): procedural floors. 'arena': the M1 test arena (tests, sandbox). */
  mode?: 'dungeon' | 'arena';
  /** Arena only: automatic enemy waves (default true). */
  waves?: boolean;
  startLevel?: number;
  party?: readonly ClassId[];
  /** Permanent upgrades (meta). Ignored when restoring: the snapshot has them. */
  bonuses?: RunBonuses;
  /** Relics that may drop (meta unlocks). Default: all. */
  relicPool?: readonly RelicId[];
  /** Daily challenge run (recorded separately in the history). */
  daily?: boolean;
  /** Resume a run saved at the start of a floor. */
  restore?: RunSnapshot;
}

/**
 * The simulation: owns the ECS world, map and seeded RNG streams and runs
 * systems in an explicit order. No DOM, no rendering: fully testable headless.
 */
export class Game implements Sim {
  readonly world: GameWorld = new World<Components>();
  map: TileMap;
  nav: FlowField;
  readonly rng: {
    readonly combat: Rng;
    readonly spawn: Rng;
    readonly ai: Rng;
    readonly progress: Rng;
    readonly loot: Rng;
  };
  readonly player: Entity;
  /** Events produced since the presentation layer last drained them. */
  readonly events: GameEvent[] = [];
  readonly mode: 'dungeon' | 'arena';
  readonly waves: WaveState = { wave: 0, timer: 0 };
  dungeon: DungeonState | null = null;
  level: number;
  tick = 0;
  hitstopTicks = 0;
  godMode = false;
  readonly daily: boolean;
  stats: RunStats;
  /** State at the start of the current floor (what the save holds). */
  floorSnapshot: RunSnapshot | null = null;
  private readonly wavesEnabled: boolean;

  constructor(
    readonly seed: string,
    readonly dt: number,
    options: GameOptions = {},
  ) {
    const root = Rng.fromString(seed);
    this.rng = {
      combat: root.fork('combat'),
      spawn: root.fork('spawn'),
      ai: root.fork('ai'),
      progress: root.fork('progress'),
      loot: root.fork('loot'),
    };
    this.mode = options.mode ?? 'dungeon';
    this.wavesEnabled = this.mode === 'arena' && (options.waves ?? true);
    const restore = options.restore;
    this.level = restore?.level ?? options.startLevel ?? 1;
    this.daily = restore?.daily ?? options.daily ?? false;
    this.stats = restore ? structuredClone(restore.stats) : emptyStats(this.level);
    const classIds = restore?.members.map((m) => m.classId) ?? options.party ?? TEAM.defaultParty;
    this.player = spawnPlayer(this, classIds, 0, 0);
    if (restore) this.restore(restore);
    else this.applyBonuses(options.bonuses ?? NO_BONUSES, options.relicPool);

    if (this.mode === 'arena') {
      const { map, markers } = TileMap.fromLayout(TEST_ARENA.layout, ENGINE.tileSize);
      this.map = map;
      this.nav = new FlowField(map);
      const start = markers.get('P')?.[0] ?? { tx: 1, ty: 1 };
      this.placePlayer(map.tileCenter(start.tx, start.ty));
    } else {
      // Assigned by loadFloor; set here so TypeScript sees them initialised.
      this.map = new TileMap(1, 1, ENGINE.tileSize);
      this.nav = new FlowField(this.map);
      this.loadFloor(this.level);
    }
  }

  get playerAlive(): boolean {
    return (this.world.get(this.player, 'health')?.hp ?? 0) > 0;
  }

  get biome(): BiomeId {
    return this.dungeon?.floor.biome ?? biomeForFloor(1);
  }

  hitstop(ticks: number): void {
    this.hitstopTicks = Math.max(this.hitstopTicks, ticks);
  }

  step(input: InputFrame): void {
    this.tick++;
    const before = this.events.length;
    snapshotTransforms(this.world);
    const alive = this.playerAlive;
    if (alive) playerBuffer(this, input);
    if (this.hitstopTicks > 0) {
      this.hitstopTicks--;
      return;
    }
    if (alive) {
      this.stats.ticks++;
      tickParty(this);
      const kit = kitFor(activeClass(this));
      if (kit.busy(this)) {
        kit.updateBusy(this, input);
      } else {
        handleSwitchInput(this);
        // The kit may have changed with the switch.
        const current = kitFor(activeClass(this));
        playerMove(this, input, current.moveFactor(this));
        current.update(this, input);
      }
      if (input.interactPressed) interact(this);
      if (input.ui) applyUiAction(this, input.ui);
      if (input.useSlot >= 0) useConsumable(this, input.useSlot, input.aimX, input.aimY);
    } else {
      const v = this.world.req(this.player, 'velocity');
      v.x = 0;
      v.y = 0;
    }
    updateZones(this);
    const pt = this.world.req(this.player, 'transform');
    this.nav.update(Math.floor(pt.x / this.map.tileSize), Math.floor(pt.y / this.map.tileSize));
    enemyAI(this);
    updateAllies(this);
    integrateMotion(this);
    separateBodies(this);
    resolveHitboxes(this);
    if (this.dungeon) breakCrackedWalls(this, this.dungeon);
    updateProjectiles(this);
    tickStatuses(this);
    tickInvulnerability(this);
    if (this.wavesEnabled && this.playerAlive) updateWaves(this, this.waves);
    updatePickups(this);
    if (this.dungeon) updateDungeon(this, this.dungeon, this.level);
    this.world.flush();
    for (let i = before; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev) trackEvent(this.stats, ev, this.player);
    }
    if (this.dungeon?.descendRequested) this.descend();
  }

  /** Takes the stairs: next floor, the party heals a bit and KO'd members come back. */
  descend(): void {
    this.level++;
    for (const m of this.world.req(this.player, 'party').members) {
      if (!m.ko) m.health.hp = Math.min(m.health.max, m.health.hp + m.health.max * DESCEND_HEAL);
    }
    const party = this.world.req(this.player, 'party');
    reviveAll(this, TEAM.descendReviveFraction + party.bonuses.reviveBonus);
    this.loadFloor(this.level);
  }

  /** Replaces the map with a generated floor and clears every non-player entity. */
  loadFloor(level: number): void {
    this.level = level;
    this.stats.deepestFloor = Math.max(this.stats.deepestFloor, level);
    this.resetTransient();
    this.floorSnapshot = this.captureSnapshot();
    for (const [e] of this.world.query('transform')) if (e !== this.player) this.world.destroy(e);
    this.world.flush();
    const floor = generateFloor(this.seed, level);
    this.map = floor.map;
    this.nav = new FlowField(floor.map);
    this.dungeon = createDungeonState(floor);
    this.placePlayer(floor.map.tileCenter(floor.spawn.tx, floor.spawn.ty));
    setupFloorLoot(this, floor);
    const party = this.world.req(this.player, 'party');
    if (party.relics.includes('lantern')) floor.explored.fill(1);
    this.events.push({ type: 'floor', level, biome: floor.biome });
  }

  /**
   * Every floor starts fresh: cooldowns, dashes, statuses, shields and
   * in-flight abilities reset. Besides being readable for the player, it
   * makes the floor-start snapshot complete (nothing transient to save).
   */
  private resetTransient(): void {
    const w = this.world;
    const party = w.req(this.player, 'party');
    party.phoenixUsed = false;
    party.switchCooldown = 0;
    for (const m of party.members) {
      const s = m.state;
      s.primaryCooldown = s.rangedCooldown = s.skillCooldown = 0;
      s.execution = null;
      s.meteors = null;
      s.inVeil = false;
      s.blockTicks = -1;
      s.boltCount = 0;
      s.spin = 0;
      s.frenzy = 0;
      s.rageIdle = 0;
      m.lockout = 0;
      m.combo.hitbox = null;
      m.combo.tick = -1;
      m.combo.index = 0;
      m.combo.idleTicks = 0;
      m.dash.charges = maxDashCharges(m);
      m.dash.recharge = 0;
      m.dash.active = 0;
      m.statuses.list = [];
      m.health.shield = 0;
      m.health.invuln = 0;
      m.health.stagger = 0;
      m.health.sinceHit = 9999;
    }
    const b = w.req(this.player, 'buffer');
    b.attack = b.ranged = b.dash = b.skill = b.ultimate = b.switchTicks = 0;
    b.switchSlot = -1;
    const imp = w.req(this.player, 'impulse');
    imp.x = imp.y = 0;
  }

  private captureSnapshot(): RunSnapshot {
    const r = this.rng;
    return {
      format: SNAPSHOT_FORMAT,
      seed: this.seed,
      level: this.level,
      daily: this.daily,
      ...snapshotParty(this.world.req(this.player, 'party')),
      rng: {
        combat: r.combat.getState(),
        spawn: r.spawn.getState(),
        ai: r.ai.getState(),
        progress: r.progress.getState(),
        loot: r.loot.getState(),
      },
      stats: structuredClone(this.stats),
    };
  }

  /** Meta bonuses for a fresh run: starting gold and potions, extra max HP. */
  private applyBonuses(bonuses: RunBonuses, relicPool?: readonly RelicId[]): void {
    const party = this.world.req(this.player, 'party');
    party.bonuses = { ...bonuses };
    party.relicPool = [...(relicPool ?? (Object.keys(RELICS) as RelicId[]))];
    party.gold += bonuses.startGold;
    if (bonuses.startPotions > 0) party.quick[0] = { id: 'potion', count: bonuses.startPotions };
    recomputeAll(this);
    for (const m of party.members) m.health.hp = m.health.max;
  }

  private restore(snap: RunSnapshot): void {
    const party = this.world.req(this.player, 'party');
    party.bonuses = { ...snap.bonuses };
    party.relicPool = [...snap.relicPool];
    party.relics = [...snap.relics];
    party.gold = snap.gold;
    party.keys = snap.keys;
    party.kills = snap.kills;
    party.quick = structuredClone(snap.quick);
    snap.members.forEach((ms, i) => {
      const m = party.members[i];
      if (!m) return;
      m.ko = ms.ko;
      m.scars = ms.scars;
      m.progress = structuredClone(ms.progress);
      m.equipment = structuredClone(ms.equipment);
      m.state.energy = ms.energy;
      m.state.mana = ms.mana;
      m.state.rage = ms.rage;
    });
    recomputeAll(this);
    snap.members.forEach((ms, i) => {
      const m = party.members[i];
      if (m) m.health.hp = ms.ko ? 0 : Math.min(m.health.max, Math.max(1, ms.hp));
    });
    if (snap.active > 0 && snap.active < party.members.length) install(this, snap.active);
    this.rng.combat.setState(snap.rng.combat);
    this.rng.spawn.setState(snap.rng.spawn);
    this.rng.ai.setState(snap.rng.ai);
    this.rng.progress.setState(snap.rng.progress);
    this.rng.loot.setState(snap.rng.loot);
  }

  private placePlayer(p: { x: number; y: number }): void {
    const t = this.world.req(this.player, 'transform');
    t.x = t.prevX = p.x;
    t.y = t.prevY = p.y;
    const v = this.world.req(this.player, 'velocity');
    v.x = 0;
    v.y = 0;
  }

  /** Max HP of the current character (HUD helper). */
  get playerClass(): (typeof CLASSES)[keyof typeof CLASSES] {
    return CLASSES[this.world.req(this.player, 'player').classId];
  }

  /** Hands accumulated events to the presentation layer. */
  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }
}
