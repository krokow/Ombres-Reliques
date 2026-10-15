import { lerp } from '../core/math';
import { Tile, type TileMap } from '../core/tilemap';
import { hashString } from '../core/rng';
import { CLASSES } from '../data/classes';
import { ENEMIES } from '../data/enemies';
import type { Game } from '../game/game';
import type { Camera } from './camera';
import type { Effects } from './effects';
import { PALETTE } from './palette';
import { drawGhoul, drawShadow, drawShadowBlade, drawShuriken } from './sprites';

export interface RenderOptions {
  showHitboxes: boolean;
}

interface Drawable {
  y: number;
  draw(): void;
}

/** Canvas 2D renderer. Reads the world, never mutates it. */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;
  private mapCache: { map: TileMap; canvas: HTMLCanvasElement } | null = null;
  private time = 0;

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

  /** Resets to screen space (CSS pixels), for HUD drawing. */
  screenSpace(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(
    game: Game,
    camera: Camera,
    fx: Effects,
    alpha: number,
    frameDt: number,
    opts: RenderOptions,
  ): void {
    const ctx = this.ctx;
    const w = game.world;
    this.time += frameDt;
    this.screenSpace();
    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.rotate(camera.shakeAngle);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x + camera.shakeX, -camera.y + camera.shakeY);

    ctx.drawImage(this.mapCanvas(game.map), 0, 0);

    const pos = (t: {
      x: number;
      y: number;
      prevX: number;
      prevY: number;
    }): { x: number; y: number } => ({
      x: lerp(t.prevX, t.x, alpha),
      y: lerp(t.prevY, t.y, alpha),
    });

    // Telegraphs go under everything so they read as ground markings.
    for (const [, ai, t, facing] of w.query('enemy', 'transform', 'facing')) {
      if (ai.phase !== 'windup') continue;
      const def = ENEMIES[ai.defId];
      const p = pos(t);
      const progress = Math.min(1, ai.phaseTicks / def.windupTicks);
      const cx = p.x + Math.cos(facing.angle) * def.strike.reach;
      const cy = p.y + Math.sin(facing.angle) * def.strike.reach;
      ctx.fillStyle = PALETTE.telegraph;
      ctx.beginPath();
      ctx.arc(cx, cy, def.strike.radius * progress, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.telegraphEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, def.strike.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const g of fx.ghosts) {
      const def = CLASSES.shadowBlade;
      ctx.globalAlpha = (g.life / g.maxLife) * 0.45;
      ctx.fillStyle = def.palette.trim;
      ctx.beginPath();
      ctx.arc(g.x, g.y, def.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const drawables: Drawable[] = [];
    for (const [e, t, r, body] of w.query('transform', 'renderable', 'body')) {
      const p = pos(t);
      const flash = fx.flashes.has(e);
      const facing = w.get(e, 'facing')?.angle ?? 0;
      drawables.push({
        y: p.y,
        draw: () => {
          drawShadow(ctx, p.x, p.y, body.radius);
          if (r.kind === 'shadowBlade') {
            const health = w.req(e, 'health');
            const v = w.req(e, 'velocity');
            const dead = health.hp <= 0;
            // Blink during post-hurt i-frames (not during dash i-frames).
            const blinking =
              health.invuln > 1 &&
              w.req(e, 'dash').active === 0 &&
              Math.floor(this.time * 20) % 2 === 0;
            drawShadowBlade(ctx, p.x, p.y, body.radius, facing, CLASSES.shadowBlade.palette, {
              flash,
              time: this.time,
              moveX: v.x,
              moveY: v.y,
              alpha: dead ? 0.25 : blinking ? 0.4 : 1,
            });
          } else if (r.kind === 'ghoul') {
            const ai = w.req(e, 'enemy');
            const def = ENEMIES[ai.defId];
            drawGhoul(ctx, p.x, p.y, body.radius, facing, def.palette, {
              flash,
              time: this.time,
              windup: ai.phase === 'windup' ? Math.min(1, ai.phaseTicks / def.windupTicks) : 0,
              striking: ai.phase === 'strike',
              staggered: w.req(e, 'health').stagger > 0,
            });
          }
        },
      });
    }
    for (const [, , t] of w.query('projectile', 'transform')) {
      const p = pos(t);
      drawables.push({ y: p.y, draw: () => drawShuriken(ctx, p.x, p.y, 4, this.time) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    this.drawSlashes(game, fx, alpha);
    fx.drawParticles(ctx);
    this.drawEnemyBars(game, alpha);
    if (opts.showHitboxes) this.drawHitboxes(game);
    fx.drawTexts(ctx);
    ctx.restore();
  }

  private drawSlashes(game: Game, fx: Effects, alpha: number): void {
    const ctx = this.ctx;
    const trim = CLASSES.shadowBlade.palette.trim;
    for (const s of fx.slashes) {
      const ot = game.world.get(s.owner, 'transform');
      const x = ot ? lerp(ot.prevX, ot.x, alpha) : s.x;
      const y = ot ? lerp(ot.prevY, ot.y, alpha) : s.y;
      const t = 1 - s.life / s.maxLife;
      const sweep = Math.min(1, t * 3);
      // Alternate swing direction between combo hits.
      const dir = s.combo % 2 === 0 ? 1 : -1;
      const start = s.angle - (dir * s.arc) / 2;
      const end = start + dir * s.arc * sweep;
      const outer = s.range * (1 + t * 0.12);
      const inner = s.range * (s.combo === 2 ? 0.35 : 0.5);
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = s.combo === 2 ? '#ffffff' : '#ece6ff';
      ctx.beginPath();
      ctx.arc(x, y, outer, start, end, dir < 0);
      ctx.arc(x, y, inner, end, start, dir > 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, outer, start, end, dir < 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemyBars(game: Game, alpha: number): void {
    const ctx = this.ctx;
    for (const [, , t, h, body] of game.world.query('enemy', 'transform', 'health', 'body')) {
      if (h.hp >= h.max) continue;
      const x = lerp(t.prevX, t.x, alpha);
      const y = lerp(t.prevY, t.y, alpha) - body.radius - 9;
      const wdt = body.radius * 2;
      ctx.fillStyle = PALETTE.hpBack;
      ctx.fillRect(x - wdt / 2, y, wdt, 3);
      ctx.fillStyle = PALETTE.hp;
      ctx.fillRect(x - wdt / 2, y, (wdt * h.hp) / h.max, 3);
    }
  }

  private drawHitboxes(game: Game): void {
    const ctx = this.ctx;
    const w = game.world;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#3cff8f';
    for (const [, t, b] of w.query('transform', 'body')) {
      ctx.strokeRect(t.x - b.radius, t.y - b.radius, b.radius * 2, b.radius * 2);
      ctx.beginPath();
      ctx.arc(t.x, t.y, b.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const [, hb, t] of w.query('hitbox', 'transform')) {
      ctx.strokeStyle = hb.delay > 0 ? '#888888' : hb.team === 'player' ? '#4dc3ff' : '#ff4d4d';
      ctx.beginPath();
      if (hb.shape.kind === 'arc') {
        ctx.moveTo(t.x, t.y);
        ctx.arc(t.x, t.y, hb.shape.range, hb.angle - hb.shape.arc / 2, hb.angle + hb.shape.arc / 2);
        ctx.closePath();
      } else {
        ctx.arc(
          t.x + Math.cos(hb.angle) * hb.shape.offset,
          t.y + Math.sin(hb.angle) * hb.shape.offset,
          hb.shape.radius,
          0,
          Math.PI * 2,
        );
      }
      ctx.stroke();
    }
    for (const [, f, t] of w.query('facing', 'transform')) {
      ctx.strokeStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(f.angle) * 20, t.y + Math.sin(f.angle) * 20);
      ctx.stroke();
    }
  }

  /** Static tiles are pre-rendered once per map. */
  private mapCanvas(map: TileMap): HTMLCanvasElement {
    if (this.mapCache?.map === map) return this.mapCache.canvas;
    const s = map.tileSize;
    const canvas = document.createElement('canvas');
    canvas.width = map.width * s;
    canvas.height = map.height * s;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const x = tx * s;
        const y = ty * s;
        // Visual-only hash: deterministic per tile without touching gameplay RNG.
        const h = hashString(`${tx},${ty}`);
        if (map.get(tx, ty) === Tile.Floor) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
          ctx.fillRect(x, y, s, s);
          if (h % 7 === 0) {
            ctx.strokeStyle = PALETTE.floorCrack;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + (h % s), y + 4);
            ctx.lineTo(x + ((h >> 5) % s), y + s / 2);
            ctx.lineTo(x + ((h >> 10) % s), y + s - 4);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = PALETTE.wallFace;
          ctx.fillRect(x, y, s, s);
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(x, y, s, s - 8);
          // Light edge where a wall borders floor, for readability.
          ctx.fillStyle = PALETTE.wallEdge;
          if (!map.isSolid(tx, ty - 1)) ctx.fillRect(x, y, s, 2);
          if (!map.isSolid(tx - 1, ty)) ctx.fillRect(x, y, 2, s - 8);
          if (!map.isSolid(tx + 1, ty)) ctx.fillRect(x + s - 2, y, 2, s - 8);
        }
      }
    }
    this.mapCache = { map, canvas };
    return canvas;
  }
}
