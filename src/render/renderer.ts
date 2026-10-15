import { lerp } from '../core/math';
import { Tile, type TileMap } from '../core/tilemap';
import { hashString } from '../core/rng';
import { CLASSES } from '../data/classes';
import { ELITE_MODIFIERS } from '../data/elites';
import { enemyDef } from '../data/enemies';
import { STATUSES } from '../data/statuses';
import type { RenderKind } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Game } from '../game/game';
import { hasStatus } from '../systems/statuses';
import type { Camera } from './camera';
import type { Effects } from './effects';
import { PALETTE } from './palette';
import {
  drawArcher,
  drawBloater,
  drawBoneArrow,
  drawCryptomancer,
  drawGhoul,
  drawShadow,
  drawShadowBlade,
  drawShuriken,
  drawSmoke,
} from './sprites';

export interface RenderOptions {
  showHitboxes: boolean;
}

interface Drawable {
  y: number;
  draw(): void;
}

interface Interp {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

function interp(t: Interp, alpha: number): { x: number; y: number } {
  return { x: lerp(t.prevX, t.x, alpha), y: lerp(t.prevY, t.y, alpha) };
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
    this.drawTelegraphs(game, alpha);

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
      const p = interp(t, alpha);
      drawables.push({
        y: p.y,
        draw: () => this.drawActor(game, e, r.kind, p.x, p.y, body.radius, fx),
      });
    }
    for (const [e, , t] of w.query('projectile', 'transform')) {
      const p = interp(t, alpha);
      const kind = w.get(e, 'renderable')?.kind;
      const v = w.get(e, 'velocity');
      drawables.push({
        y: p.y,
        draw: () =>
          kind === 'boneArrow'
            ? drawBoneArrow(ctx, p.x, p.y, Math.atan2(v?.y ?? 0, v?.x ?? 1))
            : drawShuriken(ctx, p.x, p.y, 4, this.time),
      });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // Smoke is drawn over actors so it actually hides them.
    for (const [, z, t] of w.query('zone', 'transform')) {
      drawSmoke(ctx, t.x, t.y, z.radius, z.ticks / z.maxTicks, this.time);
    }

    this.drawSlashes(game, fx, alpha);
    fx.drawParticles(ctx);
    this.drawEnemyBars(game, alpha);
    if (opts.showHitboxes) this.drawHitboxes(game);
    fx.drawTexts(ctx);
    ctx.restore();
  }

  private drawActor(
    game: Game,
    e: Entity,
    kind: RenderKind,
    x: number,
    y: number,
    radius: number,
    fx: Effects,
  ): void {
    const ctx = this.ctx;
    const w = game.world;
    const flash = fx.flashes.has(e);
    const facing = w.get(e, 'facing')?.angle ?? 0;
    drawShadow(ctx, x, y, radius);

    const elite = w.get(e, 'elite');
    if (elite) {
      elite.mods.forEach((m, i) => {
        ctx.strokeStyle = ELITE_MODIFIERS[m].color;
        ctx.globalAlpha = 0.55 + Math.sin(this.time * 5 + i) * 0.25;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius + 5 + i * 3, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (kind === 'shadowBlade') {
      const health = w.req(e, 'health');
      const v = w.req(e, 'velocity');
      const dead = health.hp <= 0;
      const executing = w.req(e, 'player').execution !== null;
      // Blink during post-hurt i-frames (not during dash/ultimate i-frames).
      const blinking =
        health.invuln > 2 &&
        w.req(e, 'dash').active === 0 &&
        !executing &&
        Math.floor(this.time * 20) % 2 === 0;
      if (hasStatus(w, e, 'ambush')) {
        ctx.strokeStyle = STATUSES.ambush.color;
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 12) * 0.3;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      drawShadowBlade(ctx, x, y, radius, facing, CLASSES.shadowBlade.palette, {
        flash,
        time: this.time,
        moveX: v.x,
        moveY: v.y,
        alpha: dead ? 0.25 : blinking ? 0.4 : 1,
        invisible: hasStatus(w, e, 'invisible'),
      });
      return;
    }

    const ai = w.get(e, 'enemy');
    if (!ai) return;
    const def = enemyDef(ai.defId);
    const progress = (total: number): number => Math.min(1, ai.phaseTicks / total);
    switch (def.behavior) {
      case 'melee':
        drawGhoul(ctx, x, y, radius, facing, def.palette, {
          flash,
          time: this.time,
          windup: ai.phase === 'windup' ? progress(def.windupTicks) : 0,
          striking: ai.phase === 'strike',
          staggered: w.req(e, 'health').stagger > 0,
        });
        break;
      case 'ranged':
        drawArcher(ctx, x, y, radius, facing, def.palette, {
          flash,
          draw: ai.phase === 'windup' ? progress(def.windupTicks) : 0,
        });
        break;
      case 'kamikaze':
        drawBloater(ctx, x, y, radius, def.palette, {
          flash,
          time: this.time,
          fuse: ai.phase === 'fuse' ? progress(def.fuseTicks) : 0,
        });
        break;
      case 'summoner':
        drawCryptomancer(ctx, x, y, radius, facing, def.palette, {
          flash,
          time: this.time,
          channel: ai.phase === 'channel' ? progress(def.channelTicks) : 0,
        });
        break;
    }
  }

  /** Ground markings announcing every incoming attack: readability first. */
  private drawTelegraphs(game: Game, alpha: number): void {
    const ctx = this.ctx;
    const w = game.world;
    for (const [, ai, t, facing, body] of w.query('enemy', 'transform', 'facing', 'body')) {
      const def = enemyDef(ai.defId);
      const p = interp(t, alpha);
      if (def.behavior === 'melee' && ai.phase === 'windup') {
        const progress = Math.min(1, ai.phaseTicks / def.windupTicks);
        const cx = p.x + Math.cos(facing.angle) * def.strike.reach;
        const cy = p.y + Math.sin(facing.angle) * def.strike.reach;
        this.telegraphCircle(cx, cy, def.strike.radius, progress);
      } else if (def.behavior === 'ranged' && ai.phase === 'windup') {
        const locked = ai.phaseTicks >= def.windupTicks - def.aimLockTicks;
        const a = Math.atan2(ai.aimY - p.y, ai.aimX - p.x);
        const len = def.projectile.speed * (def.projectile.lifetimeTicks / 60);
        ctx.strokeStyle = locked ? PALETTE.telegraphEdge : PALETTE.telegraph;
        ctx.lineWidth = locked ? 2 : 1;
        ctx.setLineDash(locked ? [] : [6, 6]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (def.behavior === 'kamikaze' && ai.phase === 'fuse') {
        this.telegraphCircle(
          p.x,
          p.y,
          def.explosion.radius,
          Math.min(1, ai.phaseTicks / def.fuseTicks),
        );
      } else if (def.behavior === 'summoner' && ai.phase === 'channel') {
        const progress = Math.min(1, ai.phaseTicks / def.channelTicks);
        ctx.fillStyle = `rgba(199, 125, 255, ${0.1 + progress * 0.15})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, body.radius * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Pending explosions (death fuses).
    for (const [e, hb, t] of w.query('hitbox', 'transform')) {
      if (hb.delay <= 0 || w.get(e, 'renderable')?.kind !== 'explosion') continue;
      if (hb.shape.kind !== 'circle') continue;
      this.telegraphCircle(t.x, t.y, hb.shape.radius, 1 - hb.delay / 20);
    }
  }

  private telegraphCircle(x: number, y: number, radius: number, progress: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.telegraph;
    ctx.beginPath();
    ctx.arc(x, y, radius * Math.max(0, Math.min(1, progress)), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.telegraphEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawSlashes(game: Game, fx: Effects, alpha: number): void {
    const ctx = this.ctx;
    const trim = CLASSES.shadowBlade.palette.trim;
    for (const s of fx.slashes) {
      const ot = game.world.get(s.owner, 'transform');
      const { x, y } = ot ? interp(ot, alpha) : s;
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
    for (const b of fx.blinks) {
      const k = b.life / b.maxLife;
      ctx.globalAlpha = k;
      ctx.strokeStyle = CLASSES.shadowBlade.palette.eyes;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath();
      ctx.moveTo(b.fromX, b.fromY);
      ctx.lineTo(b.toX, b.toY);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemyBars(game: Game, alpha: number): void {
    const ctx = this.ctx;
    const w = game.world;
    for (const [e, , t, h, body] of w.query('enemy', 'transform', 'health', 'body')) {
      const p = interp(t, alpha);
      const y = p.y - body.radius - 9;
      const wdt = Math.max(20, body.radius * 2);
      if (h.hp < h.max || w.has(e, 'elite')) {
        ctx.fillStyle = PALETTE.hpBack;
        ctx.fillRect(p.x - wdt / 2, y, wdt, 3);
        ctx.fillStyle = w.has(e, 'elite') ? PALETTE.crit : PALETTE.hp;
        ctx.fillRect(p.x - wdt / 2, y, (wdt * h.hp) / h.max, 3);
      }
      const statuses = w.get(e, 'statuses')?.list ?? [];
      statuses.forEach((s, i) => {
        ctx.fillStyle = STATUSES[s.id].color;
        const sx = p.x - wdt / 2 + i * 6 + 2;
        if (s.id === 'mark') {
          ctx.beginPath();
          ctx.moveTo(sx, y - 7);
          ctx.lineTo(sx + 3, y - 4);
          ctx.lineTo(sx, y - 1);
          ctx.lineTo(sx - 3, y - 4);
          ctx.fill();
        } else {
          ctx.fillRect(sx - 2, y - 6, 4, 4);
        }
      });
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
      ctx.strokeStyle =
        hb.delay > 0
          ? '#888888'
          : hb.team === 'player'
            ? '#4dc3ff'
            : hb.team === 'neutral'
              ? '#ffb347'
              : '#ff4d4d';
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
    // A* paths.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    for (const [, ai, t] of w.query('enemy', 'transform')) {
      if (ai.path.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      for (const n of ai.path) {
        const c = game.map.tileCenter(n.tx, n.ty);
        ctx.lineTo(c.x, c.y);
      }
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
