import type { GameWorld } from '../ecs/components';
import type { InputFrame } from '../game/inputFrame';

export function playerControl(world: GameWorld, input: InputFrame): void {
  for (const [, p, v] of world.query('player', 'velocity')) {
    v.x = input.moveX * p.moveSpeed;
    v.y = input.moveY * p.moveSpeed;
  }
}
