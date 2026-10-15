export const Tile = {
  Floor: 0,
  Wall: 1,
  DoorOpen: 2,
  DoorClosed: 3,
  /** Breakable wall hiding a secret room. */
  Cracked: 4,
  Stairs: 5,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

const SOLID: readonly boolean[] = [false, true, false, true, true, false];

/** Grid of tiles in world space; tile (tx, ty) covers [tx*size, (tx+1)*size). */
export class TileMap {
  readonly tiles: Uint8Array;
  /** Bumped on every change, so caches (nav field, minimap…) know when to refresh. */
  version = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly tileSize: number,
    fill: Tile = Tile.Floor,
  ) {
    this.tiles = new Uint8Array(width * height).fill(fill);
  }

  /** Builds a map from ASCII rows; returns the map and the positions of marker chars. */
  static fromLayout(
    rows: readonly string[],
    tileSize: number,
  ): { map: TileMap; markers: Map<string, { tx: number; ty: number }[]> } {
    const height = rows.length;
    const width = Math.max(...rows.map((r) => r.length));
    const map = new TileMap(width, height, tileSize, Tile.Wall);
    const markers = new Map<string, { tx: number; ty: number }[]>();
    rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const ch = row[tx] ?? '#';
        if (ch === '#') continue;
        map.set(tx, ty, Tile.Floor);
        if (ch !== '.') {
          const list = markers.get(ch) ?? [];
          list.push({ tx, ty });
          markers.set(ch, list);
        }
      }
    });
    return { map, markers };
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  get(tx: number, ty: number): Tile {
    return this.inBounds(tx, ty) ? (this.tiles[ty * this.width + tx] as Tile) : Tile.Wall;
  }

  set(tx: number, ty: number, tile: Tile): void {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.width + tx;
    if (this.tiles[i] === tile) return;
    this.tiles[i] = tile;
    this.version++;
  }

  /** Out-of-bounds counts as solid so nothing escapes the map. */
  isSolid(tx: number, ty: number): boolean {
    return SOLID[this.get(tx, ty)] ?? true;
  }

  isSolidAt(x: number, y: number): boolean {
    return this.isSolid(Math.floor(x / this.tileSize), Math.floor(y / this.tileSize));
  }

  /** True if the axis-aligned box [x0,x1)×[y0,y1) touches any solid tile. */
  rectOverlapsSolid(x0: number, y0: number, x1: number, y1: number): boolean {
    const s = this.tileSize;
    const tx0 = Math.floor(x0 / s);
    const ty0 = Math.floor(y0 / s);
    const tx1 = Math.floor((x1 - 1e-6) / s);
    const ty1 = Math.floor((y1 - 1e-6) / s);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) if (this.isSolid(tx, ty)) return true;
    }
    return false;
  }

  /** Grid DDA raycast: true if no solid tile lies strictly between the two points. */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const s = this.tileSize;
    let tx = Math.floor(x0 / s);
    let ty = Math.floor(y0 / s);
    const endX = Math.floor(x1 / s);
    const endY = Math.floor(y1 / s);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(s / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(s / dy) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (tx + 1) * s : tx * s) - x0) / dx : Infinity;
    let tMaxY = dy !== 0 ? ((dy > 0 ? (ty + 1) * s : ty * s) - y0) / dy : Infinity;
    while (tx !== endX || ty !== endY) {
      if (tMaxX < tMaxY) {
        if (tMaxX > 1) break;
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        if (tMaxY > 1) break;
        tMaxY += tDeltaY;
        ty += stepY;
      }
      if ((tx !== endX || ty !== endY) && this.isSolid(tx, ty)) return false;
    }
    return true;
  }

  tileCenter(tx: number, ty: number): { x: number; y: number } {
    return { x: (tx + 0.5) * this.tileSize, y: (ty + 0.5) * this.tileSize };
  }
}

export interface MoveResult {
  x: number;
  y: number;
  hitX: boolean;
  hitY: boolean;
}

/**
 * Moves a square body (half-extent `half`) by (dx, dy), resolving each axis
 * separately so the body slides along walls. Moves are sub-stepped so fast
 * bodies (dash) can never tunnel through a tile.
 */
export function moveAndCollide(
  map: TileMap,
  x: number,
  y: number,
  half: number,
  dx: number,
  dy: number,
): MoveResult {
  const maxStep = Math.max(1, half * 0.9);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const sx = dx / steps;
  const sy = dy / steps;
  const s = map.tileSize;
  let hitX = false;
  let hitY = false;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !hitX) {
      const nx = x + sx;
      if (map.rectOverlapsSolid(nx - half, y - half, nx + half, y + half)) {
        // Snap flush against the tile edge we ran into.
        x =
          sx > 0
            ? Math.floor((nx + half) / s) * s - half - 1e-4
            : Math.floor((nx - half) / s + 1) * s + half + 1e-4;
        hitX = true;
      } else x = nx;
    }
    if (sy !== 0 && !hitY) {
      const ny = y + sy;
      if (map.rectOverlapsSolid(x - half, ny - half, x + half, ny + half)) {
        y =
          sy > 0
            ? Math.floor((ny + half) / s) * s - half - 1e-4
            : Math.floor((ny - half) / s + 1) * s + half + 1e-4;
        hitY = true;
      } else y = ny;
    }
  }
  return { x, y, hitX, hitY };
}
