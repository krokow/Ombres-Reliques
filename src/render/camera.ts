import { CAMERA } from '../data/config';
import { clamp, damp, type Vec2 } from '../core/math';

/** Cheap smooth 1D noise in [-1, 1] from layered sines (no RNG needed for shake). */
function wobble(t: number, seed: number): number {
  return (Math.sin(t * 37.1 + seed) + Math.sin(t * 59.3 + seed * 2.1) * 0.6) / 1.6;
}

/**
 * Render-side camera: smooth follow, aim lookahead and trauma-based shake.
 * Never read by the simulation.
 */
export class Camera {
  x = 0;
  y = 0;
  viewportWidth = 1;
  viewportHeight = 1;
  zoom: number = CAMERA.zoom;
  /** 0..1; shake intensity is trauma² so small hits stay subtle. */
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  shakeAngle = 0;
  private time = 0;

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    // Keep roughly the same field of view on small screens.
    this.zoom = CAMERA.zoom * clamp(Math.min(width / 1280, height / 720) * 1.15, 0.6, 1.4);
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
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

    this.time += dt;
    this.trauma = Math.max(0, this.trauma - CAMERA.traumaDecay * dt);
    const s = this.trauma * this.trauma;
    this.shakeX = CAMERA.shakeOffset * s * wobble(this.time, 1);
    this.shakeY = CAMERA.shakeOffset * s * wobble(this.time, 7);
    this.shakeAngle = CAMERA.shakeAngle * s * wobble(this.time, 13);
  }

  /** Ignores shake on purpose: aiming must stay stable while the screen shakes. */
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
