import { Tile } from '../core/tilemap';
import { BIOMES } from '../data/biomes';
import type { RoomType } from '../dungeon/floor';
import type { Game } from '../game/game';

const ROOM_TINT: Partial<Record<RoomType, string>> = {
  start: '#3d5a80',
  boss: '#8a1c2b',
  miniboss: '#a8572a',
  treasure: '#8a7424',
  shop: '#2f7a4f',
  altar: '#6a3d8a',
  secret: '#4a4a6a',
};

const ROOM_ICON: Partial<Record<RoomType, { glyph: string; color: string }>> = {
  boss: { glyph: 'B', color: '#ff5a6e' },
  miniboss: { glyph: 'M', color: '#ffa04d' },
  treasure: { glyph: 'T', color: '#ffd34d' },
  shop: { glyph: '$', color: '#7dffa8' },
  altar: { glyph: 'A', color: '#d38bff' },
  secret: { glyph: '?', color: '#cfd6ff' },
};

/** Fog-of-war minimap: explored tiles only, cached until exploration or tiles change. */
export class Minimap {
  private cache: { key: string; canvas: HTMLCanvasElement } | null = null;
  expanded = false;

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    game: Game,
    time: number,
  ): void {
    const d = game.dungeon;
    if (!d) return;
    const { map, explored, roomAt, rooms } = d.floor;
    const scale = this.expanded
      ? Math.max(4, Math.floor(Math.min((width - 80) / map.width, (height - 120) / map.height)))
      : 3;
    const mw = map.width * scale;
    const mh = map.height * scale;
    const ox = this.expanded ? Math.floor((width - mw) / 2) : width - mw - 12;
    const oy = this.expanded ? Math.floor((height - mh) / 2) : 36;

    const key = `${d.exploredVersion}:${map.version}:${scale}:${d.floor.level}`;
    if (this.cache?.key !== key) {
      const canvas = this.cache?.canvas ?? document.createElement('canvas');
      canvas.width = mw;
      canvas.height = mh;
      const c = canvas.getContext('2d');
      if (!c) return;
      c.clearRect(0, 0, mw, mh);
      const pal = BIOMES[d.floor.biome].palette;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const i = ty * map.width + tx;
          if (!explored[i]) continue;
          const t = map.get(tx, ty);
          if (t === Tile.Wall || t === Tile.Cracked) {
            c.fillStyle = pal.wallTop;
          } else if (t === Tile.DoorClosed) {
            c.fillStyle = '#c0b0a0';
          } else {
            const r = rooms[roomAt[i] ?? -1];
            c.fillStyle = (r && ROOM_TINT[r.type]) ?? '#5b5470';
          }
          c.fillRect(tx * scale, ty * scale, scale, scale);
        }
      }
      this.cache = { key, canvas };
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
    ctx.drawImage(this.cache.canvas, ox, oy);

    // Icons for special rooms once any of their tiles has been seen.
    ctx.font = `bold ${Math.max(9, scale * 3)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of rooms) {
      const icon = ROOM_ICON[room.type];
      if (!icon || !explored[room.center.ty * map.width + room.center.tx]) continue;
      ctx.fillStyle = icon.color;
      ctx.fillText(
        icon.glyph,
        ox + (room.center.tx + 1) * scale,
        oy + (room.center.ty + 1) * scale,
      );
    }
    if (d.stairs) {
      ctx.fillStyle = '#9b7bff';
      ctx.fillText('▼', ox + (d.stairs.tx + 0.5) * scale, oy + (d.stairs.ty + 0.5) * scale);
    }
    const pt = game.world.get(game.player, 'transform');
    if (pt) {
      const s = map.tileSize;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(
        ox + (pt.x / s) * scale,
        oy + (pt.y / s) * scale,
        scale * (1.2 + Math.sin(time * 6) * 0.3),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}
