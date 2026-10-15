import { Rng } from '../core/rng';
import { World } from '../ecs/world';
import { transformAt, type Components, type GameWorld } from '../ecs/components';
import type { Entity } from '../ecs/world';
import { PLAYER_PROTOTYPE } from '../data/config';
import { integrateVelocity, snapshotTransforms } from '../systems/movement';
import { playerControl } from '../systems/playerControl';
import type { InputFrame } from './inputFrame';

/**
 * The simulation: owns the ECS world and the seeded RNG and runs systems in
 * an explicit order. No DOM, no rendering: fully testable headless.
 */
export class Game {
  readonly world: GameWorld = new World<Components>();
  readonly rng: Rng;
  tick = 0;
  player: Entity;

  constructor(
    readonly seed: string,
    readonly dt: number,
  ) {
    this.rng = Rng.fromString(seed);
    this.player = this.spawnPlayer(0, 0);
  }

  step(input: InputFrame): void {
    const w = this.world;
    snapshotTransforms(w);
    playerControl(w, input);
    integrateVelocity(w, this.dt);
    w.flush();
    this.tick++;
  }

  private spawnPlayer(x: number, y: number): Entity {
    const w = this.world;
    const e = w.create();
    w.add(e, 'transform', transformAt(x, y));
    w.add(e, 'velocity', { x: 0, y: 0 });
    w.add(e, 'player', { moveSpeed: PLAYER_PROTOTYPE.moveSpeed });
    w.add(e, 'renderable', {
      shape: 'rect',
      width: PLAYER_PROTOTYPE.size,
      height: PLAYER_PROTOTYPE.size,
      color: PLAYER_PROTOTYPE.color,
    });
    return e;
  }
}
