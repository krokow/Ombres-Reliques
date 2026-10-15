import { Rng } from '../core/rng';
import { TileMap } from '../core/tilemap';
import { TEST_ARENA } from '../data/arenas';
import { ENGINE } from '../data/config';
import { World } from '../ecs/world';
import type { Components, GameWorld } from '../ecs/components';
import type { Entity } from '../ecs/world';
import { resolveHitboxes, tickInvulnerability, updateProjectiles } from '../systems/combat';
import { enemyAI } from '../systems/enemyAI';
import { FlowField } from '../systems/navigation';
import { integrateMotion, separateBodies, snapshotTransforms } from '../systems/movement';
import { playerBuffer, playerCombo, playerDash, playerMove, playerRanged } from '../systems/player';
import { updateWaves, type WaveState } from '../systems/waves';
import type { GameEvent } from './events';
import { spawnPlayer } from './factories';
import type { InputFrame } from './inputFrame';
import type { Sim } from './sim';

export interface GameOptions {
  /** Disable automatic enemy waves (tests, sandbox). */
  waves?: boolean;
}

/**
 * The simulation: owns the ECS world, map and seeded RNG streams and runs
 * systems in an explicit order. No DOM, no rendering: fully testable headless.
 */
export class Game implements Sim {
  readonly world: GameWorld = new World<Components>();
  readonly map: TileMap;
  readonly rng: { readonly combat: Rng; readonly spawn: Rng };
  readonly player: Entity;
  /** Events produced since the presentation layer last drained them. */
  readonly events: GameEvent[] = [];
  readonly nav: FlowField;
  readonly waves: WaveState = { wave: 0, timer: 0 };
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
    this.rng = { combat: root.fork('combat'), spawn: root.fork('spawn') };
    this.wavesEnabled = options.waves ?? true;
    const { map, markers } = TileMap.fromLayout(TEST_ARENA.layout, ENGINE.tileSize);
    this.map = map;
    this.nav = new FlowField(map);
    const start = markers.get('P')?.[0] ?? { tx: 1, ty: 1 };
    const c = map.tileCenter(start.tx, start.ty);
    this.player = spawnPlayer(this, 'shadowBlade', c.x, c.y);
  }

  get playerAlive(): boolean {
    return (this.world.get(this.player, 'health')?.hp ?? 0) > 0;
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
    if (alive) {
      playerMove(this, input);
      playerDash(this, input);
      playerCombo(this);
      playerRanged(this);
    } else {
      const v = this.world.req(this.player, 'velocity');
      v.x = 0;
      v.y = 0;
    }
    const pt = this.world.req(this.player, 'transform');
    this.nav.update(Math.floor(pt.x / this.map.tileSize), Math.floor(pt.y / this.map.tileSize));
    enemyAI(this, alive);
    integrateMotion(this);
    separateBodies(this);
    resolveHitboxes(this);
    updateProjectiles(this);
    tickInvulnerability(this);
    if (this.wavesEnabled && alive) updateWaves(this, this.waves);
    this.world.flush();
  }

  /** Hands accumulated events to the presentation layer. */
  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }
}
