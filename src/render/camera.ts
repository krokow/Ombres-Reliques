import { CAMERA } from '../data/config';
import { clamp, damp, type Vec2 } from '../core/math';

/** Render-side camera: smooth follow + aim lookahead. Never read by the simulation. */
export class Camera {
  x = 0;
  y = 0;
  viewportWidth = 1;
  viewportHeight = 1;
  zoom = 1;

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** `aim` is the cursor in world space; the camera leans slightly towards it. */
  follow(target: Vec2, aim: Vec2 | null, dt: number): void {
    let tx = target.x;
    let ty = target.y;
    if (aim) {
      tx += clamp(
        (aim.x - target.x) * CAMERA.aimLookahead,
        -CAMERA.maxLookahead,
        CAMERA.maxLookahead,
      );
      ty += clamp(
        (aim.y - target.y) * CAMERA.aimLookahead,
        -CAMERA.maxLookahead,
        CAMERA.maxLookahead,
      );
    }
    const k = damp(CAMERA.followRate, dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.viewportWidth / 2) / this.zoom + this.x,
      y: (sy - this.viewportHeight / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: (wx - this.x) * this.zoom + this.viewportWidth / 2,
      y: (wy - this.y) * this.zoom + this.viewportHeight / 2,
    };
  }
}
