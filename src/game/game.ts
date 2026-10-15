import { Rng } from '../core/rng';
import { TileMap } from '../core/tilemap';
import { TEST_ARENA } from '../data/arenas';
import { biomeForFloor, type BiomeId } from '../data/biomes';
import { CLASSES } from '../data/classes';
import { ENGINE } from '../data/config';
import { DESCEND_HEAL } from '../data/dungeon';
import { generateFloor } from '../dungeon/generate';
import { World } from '../ecs/world';
import type { Components, GameWorld } from '../ecs/components';
import type { Entity } from '../ecs/world';
import { enemyAI } from '../systems/ai';
import { resolveHitboxes, tickInvulnerability, updateProjectiles } from '../systems/combat';
import {
  breakCrackedWalls,
  createDungeonState,
  updateDungeon,
  type DungeonState,
} from '../systems/dungeon';
import { integrateMotion, separateBodies, snapshotTransforms } from '../systems/movement';
import { FlowField } from '../systems/navigation';
import {
  isExecuting,
  playerBuffer,
  playerCombo,
  playerDash,
  playerMove,
  playerRanged,
} from '../systems/player';
import { playerUltimate, playerVeil, updateZones } from '../systems/skills';
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
}

/**
 * The simulation: owns the ECS world, map and seeded RNG streams and runs
 * systems in an explicit order. No DOM, no rendering: fully testable headless.
 */
export class Game implements Sim {
  readonly world: GameWorld = new World<Components>();
  map: TileMap;
  nav: FlowField;
  readonly rng: { readonly combat: Rng; readonly spawn: Rng; readonly ai: Rng };
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
  private readonly wavesEnabled: boolean;

  constructor(
    readonly seed: string,
    readonly dt: number,
    options: GameOptions = {},
  ) {
    const root = Rng.fromString(seed);
    this.rng = { combat: root.fork('combat'), spawn: root.fork('spawn'), ai: root.fork('ai') };
    this.mode = options.mode ?? 'dungeon';
    this.wavesEnabled = this.mode === 'arena' && (options.waves ?? true);
    this.level = options.startLevel ?? 1;
    this.player = spawnPlayer(this, 'shadowBlade', 0, 0);

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
    snapshotTransforms(this.world);
    const alive = this.playerAlive;
    if (alive) playerBuffer(this, input);
    if (this.hitstopTicks > 0) {
      this.hitstopTicks--;
      return;
    }
    if (alive && isExecuting(this)) {
      playerUltimate(this);
    } else if (alive) {
      playerMove(this, input);
      playerDash(this, input);
      playerCombo(this);
      playerRanged(this);
      playerVeil(this);
      playerUltimate(this);
    } else {
      const v = this.world.req(this.player, 'velocity');
      v.x = 0;
      v.y = 0;
    }
    updateZones(this);
    const pt = this.world.req(this.player, 'transform');
    this.nav.update(Math.floor(pt.x / this.map.tileSize), Math.floor(pt.y / this.map.tileSize));
    enemyAI(this);
    integrateMotion(this);
    separateBodies(this);
    resolveHitboxes(this);
    if (this.dungeon) breakCrackedWalls(this, this.dungeon);
    updateProjectiles(this);
    tickStatuses(this);
    tickInvulnerability(this);
    if (this.wavesEnabled && this.playerAlive) updateWaves(this, this.waves);
    if (this.dungeon) updateDungeon(this, this.dungeon, this.level);
    this.world.flush();
    if (this.dungeon?.descendRequested) this.descend();
  }

  /** Takes the stairs: next floor, same character. */
  descend(): void {
    this.level++;
    const h = this.world.req(this.player, 'health');
    h.hp = Math.min(h.max, h.hp + h.max * DESCEND_HEAL);
    this.loadFloor(this.level);
  }

  /** Replaces the map with a generated floor and clears every non-player entity. */
  loadFloor(level: number): void {
    this.level = level;
    for (const [e] of this.world.query('transform')) if (e !== this.player) this.world.destroy(e);
    this.world.flush();
    const floor = generateFloor(this.seed, level);
    this.map = floor.map;
    this.nav = new FlowField(floor.map);
    this.dungeon = createDungeonState(floor);
    this.placePlayer(floor.map.tileCenter(floor.spawn.tx, floor.spawn.ty));
    const player = this.world.req(this.player, 'player');
    player.execution = null;
    player.inVeil = false;
    this.world.req(this.player, 'combo').hitbox = null;
    this.events.push({ type: 'floor', level, biome: floor.biome });
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
