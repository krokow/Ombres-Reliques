import { lerp } from '../core/math';
import { ENGINE } from '../data/config';
import type { Game } from '../game/game';
import type { Camera } from './camera';

export interface RenderOptions {
  showHitboxes: boolean;
}

/** Canvas 2D renderer. Reads the world, never mutates it. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
  }

  /** Matches the backing store to CSS size × devicePixelRatio for crisp output. */
  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  render(game: Game, camera: Camera, alpha: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0d0b14';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    this.drawGrid(camera);

    for (const [, t, r] of game.world.query('transform', 'renderable')) {
      const x = lerp(t.prevX, t.x, alpha);
      const y = lerp(t.prevY, t.y, alpha);
      ctx.fillStyle = r.color;
      ctx.fillRect(x - r.width / 2, y - r.height / 2, r.width, r.height);
      if (opts.showHitboxes) {
        ctx.strokeStyle = '#3cff8f';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - r.width / 2, y - r.height / 2, r.width, r.height);
      }
    }
    ctx.restore();
  }

  private drawGrid(camera: Camera): void {
    const ctx = this.ctx;
    const ts = ENGINE.tileSize;
    const halfW = this.width / 2 / camera.zoom;
    const halfH = this.height / 2 / camera.zoom;
    const x0 = Math.floor((camera.x - halfW) / ts);
    const x1 = Math.ceil((camera.x + halfW) / ts);
    const y0 = Math.floor((camera.y - halfH) / ts);
    const y1 = Math.ceil((camera.y + halfH) / ts);
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? '#16131f' : '#13111b';
        ctx.fillRect(tx * ts, ty * ts, ts, ts);
      }
    }
  }
}
