import { clamp } from '../core/math';
import { hashString } from '../core/rng';
import { Tile, type TileMap } from '../core/tilemap';
import type { BiomeDef } from '../data/biomes';
import { DEPTH } from '../data/config';

type Palette = BiomeDef['palette'];

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  /** "r, g, b" for an additive glow, or null for plain light. */
  glow: string | null;
}

export interface View {
  /** Camera centre (world). */
  cx: number;
  cy: number;
  /** Half extents of the visible area (world px). */
  halfW: number;
  halfH: number;
}

function rgbOf(col: string): [number, number, number] {
  if (col.startsWith('#')) {
    const n = parseInt(col.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = col.match(/\d+/g) ?? ['0', '0', '0'];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** Darkens a colour (#rrggbb or rgb()) by `k` (0..1). */
function shadeHex(col: string, k: number): string {
  const [r, g, b] = rgbOf(col);
  return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})`;
}

/** Lightens a colour towards white by `k` (0..1). */
function lightHex(col: string, k: number): string {
  const [r, g, b] = rgbOf(col);
  const l = (v: number): number => Math.round(v + (255 - v) * k);
  return `rgb(${l(r)},${l(g)},${l(b)})`;
}

function isWallTile(t: number): boolean {
  return t === Tile.Wall || t === Tile.Cracked;
}

/**
 * Pseudo-3D walls: every wall tile next to the floor is drawn as a block
 * whose top leans away from the screen centre, revealing the side faces
 * that face the camera. Moving changes the angle, which sells the depth.
 * Deep rock stays flat. Also returns the torches visible this frame.
 */
export function drawWalls3D(
  ctx: CanvasRenderingContext2D,
  map: TileMap,
  pal: Palette,
  view: View,
  explored: Uint8Array | null,
  time: number,
): LightSource[] {
  const s = map.tileSize;
  const x0 = Math.max(0, Math.floor((view.cx - view.halfW) / s) - 1);
  const x1 = Math.min(map.width - 1, Math.ceil((view.cx + view.halfW) / s) + 1);
  const y0 = Math.max(0, Math.floor((view.cy - view.halfH) / s) - 1);
  const y1 = Math.min(map.height - 1, Math.ceil((view.cy + view.halfH) / s) + 1);
  const solidAt = (tx: number, ty: number): boolean => map.isSolid(tx, ty);
  const faceS = lightHex(pal.wallTop, 0.05);
  const faceSide = shadeHex(pal.wallTop, 0.25);
  const faceN = shadeHex(pal.wallTop, 0.45);
  const top = lightHex(pal.wallTop, 0.18);
  const torches: LightSource[] = [];

  interface Block {
    tx: number;
    ty: number;
    d: number;
    door: boolean;
    cracked: boolean;
  }
  const blocks: Block[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = map.get(tx, ty);
      const door = t === Tile.DoorClosed;
      if (!isWallTile(t) && !door) continue;
      if (explored && !explored[ty * map.width + tx]) continue;
      let nearFloor = false;
      for (let dy = -1; dy <= 1 && !nearFloor; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (map.inBounds(tx + dx, ty + dy) && !solidAt(tx + dx, ty + dy)) nearFloor = true;
      if (!nearFloor) continue;
      const cx = (tx + 0.5) * s - view.cx;
      const cy = (ty + 0.5) * s - view.cy;
      blocks.push({ tx, ty, d: cx * cx + cy * cy, door, cracked: t === Tile.Cracked });
    }
  }
  // Far blocks first: nearer ones paint over them where they meet.
  blocks.sort((a, b) => b.d - a.d);

  for (const b of blocks) {
    const bx = b.tx * s;
    const by = b.ty * s;
    const k = DEPTH.lean * (b.door ? DEPTH.doorLean : 1);
    const max = DEPTH.maxLean * (b.door ? DEPTH.doorLean : 1);
    const ox = clamp((bx + s / 2 - view.cx) * k, -max, max);
    const oy = clamp((by + s / 2 - view.cy) * k, -max, max);
    const tx = bx + ox;
    const ty = by + oy;
    const quad = (ax: number, ay: number, bx2: number, by2: number, fill: string): void => {
      // Darker at the foot, lighter towards the top edge: reads as a lit vertical face.
      const g = ctx.createLinearGradient(ax, ay, ax + ox, ay + oy);
      g.addColorStop(0, shadeHex(fill, 0.35));
      g.addColorStop(1, fill);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx2, by2);
      ctx.lineTo(bx2 + ox, by2 + oy);
      ctx.lineTo(ax + ox, ay + oy);
      ctx.closePath();
      ctx.fill();
    };
    // Side faces that look towards the camera (and border open ground).
    const open = (dx: number, dy: number): boolean => !solidAt(b.tx + dx, b.ty + dy);
    if (oy < 0 && open(0, 1)) quad(bx, by + s, bx + s, by + s, b.door ? '#3a2b22' : faceS);
    if (oy > 0 && open(0, -1)) quad(bx, by, bx + s, by, b.door ? '#2a1f1a' : faceN);
    if (ox > 0 && open(-1, 0)) quad(bx, by, bx, by + s, b.door ? '#2a1f1a' : faceSide);
    if (ox < 0 && open(1, 0)) quad(bx + s, by, bx + s, by + s, b.door ? '#2a1f1a' : faceSide);

    // Torch on a visible south face: a flame and a warm light on the floor below.
    const h = hashString(`t${b.tx},${b.ty}`);
    if (!b.door && !b.cracked && open(0, 1) && h % DEPTH.torchEvery === 0) {
      const fx = bx + s / 2 + ox * 0.5;
      const fy = by + s + oy * 0.5;
      if (oy < 0) drawTorch(ctx, fx, fy, time + (h % 100));
      torches.push({ x: bx + s / 2, y: by + s + 6, radius: 0, intensity: 0, glow: null });
    }

    // Top.
    if (b.door) {
      ctx.fillStyle = '#4a3a2e';
      ctx.fillRect(tx, ty, s, s);
      ctx.fillStyle = '#9a8f88';
      for (let i = 0; i < 4; i++) ctx.fillRect(tx + 3 + i * 8, ty + 2, 3, s - 4);
      continue;
    }
    ctx.fillStyle = top;
    ctx.fillRect(tx - 0.5, ty - 0.5, s + 1, s + 1);
    ctx.fillStyle = pal.wallEdge;
    if (open(0, -1)) ctx.fillRect(tx, ty, s, 2);
    if (open(0, 1)) ctx.fillRect(tx, ty + s - 2, s, 2);
    if (open(-1, 0)) ctx.fillRect(tx, ty, 2, s);
    if (open(1, 0)) ctx.fillRect(tx + s - 2, ty, 2, s);
    if (b.cracked) {
      ctx.strokeStyle = '#0b0910';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx + 6, ty + 4);
      ctx.lineTo(tx + 14, ty + 12);
      ctx.lineTo(tx + 10, ty + 20);
      ctx.lineTo(tx + 20, ty + 26);
      ctx.moveTo(tx + 14, ty + 12);
      ctx.lineTo(tx + 24, ty + 9);
      ctx.stroke();
    }
  }
  return torches;
}

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  ctx.fillStyle = '#4b3a2a';
  ctx.fillRect(x - 1.5, y - 10, 3, 9);
  const f = 1 + Math.sin(time * 17) * 0.15 + Math.sin(time * 29) * 0.1;
  ctx.fillStyle = '#ffb347';
  ctx.shadowColor = '#ffb347';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(x, y - 13, 3.2 * f, 5 * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff2c0';
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 1.4, 2.4 * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/**
 * Darkness layer: fills the view with the biome's darkness, then punches
 * soft holes at every light, and composites it over the scene. Warm lights
 * also add a faint additive glow.
 */
export class Lighting {
  private canvas: HTMLCanvasElement | null = null;

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
    worldTransform: (c: CanvasRenderingContext2D) => void,
    darkness: number,
    lights: readonly LightSource[],
  ): void {
    if (darkness <= 0) return;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    this.canvas ??= document.createElement('canvas');
    const c = this.canvas;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const l = c.getContext('2d');
    if (!l) return;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, w, h);
    l.fillStyle = `rgba(4, 3, 10, ${darkness})`;
    l.fillRect(0, 0, w, h);
    l.setTransform(dpr, 0, 0, dpr, 0, 0);
    worldTransform(l);
    l.globalCompositeOperation = 'destination-out';
    for (const li of lights) {
      const g = l.createRadialGradient(li.x, li.y, 0, li.x, li.y, li.radius);
      g.addColorStop(0, `rgba(0,0,0,${li.intensity})`);
      g.addColorStop(0.5, `rgba(0,0,0,${li.intensity * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(li.x - li.radius, li.y - li.radius, li.radius * 2, li.radius * 2);
    }
    // Composite in screen space.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
    // Additive warm glows, in world space (ctx already has the world transform).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const li of lights) {
      if (!li.glow) continue;
      const r = li.radius * 0.55;
      const g = ctx.createRadialGradient(li.x, li.y, 0, li.x, li.y, r);
      g.addColorStop(0, `rgba(${li.glow}, ${0.16 * li.intensity})`);
      g.addColorStop(1, `rgba(${li.glow}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(li.x - r, li.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
