import type { TileMap } from '../core/tilemap';

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Distance field towards one target tile (BFS, 8-way, no corner cutting).
 * One field serves every enemy chasing the player, so it is cheaper than one
 * A* per enemy, and only rebuilt when the target changes tile.
 */
export class FlowField {
  private dist: Int32Array;
  private targetTx = -1;
  private targetTy = -1;

  constructor(private readonly map: TileMap) {
    this.dist = new Int32Array(map.width * map.height).fill(-1);
  }

  /** Recomputes only if the target moved to another tile. */
  update(tx: number, ty: number): void {
    if (tx === this.targetTx && ty === this.targetTy) return;
    this.targetTx = tx;
    this.targetTy = ty;
    const { map } = this;
    this.dist.fill(-1);
    if (map.isSolid(tx, ty)) return;
    const queue: number[] = [ty * map.width + tx];
    this.dist[ty * map.width + tx] = 0;
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head] as number;
      const cx = idx % map.width;
      const cy = (idx - cx) / map.width;
      const d = this.dist[idx] as number;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.passable(cx, cy, dx, dy)) continue;
        const n = ny * map.width + nx;
        if (this.dist[n] !== -1) continue;
        this.dist[n] = d + 1;
        queue.push(n);
      }
    }
  }

  distanceAt(tx: number, ty: number): number {
    return this.map.inBounds(tx, ty) ? (this.dist[ty * this.map.width + tx] as number) : -1;
  }

  /** Neighbour tile that gets closest to the target, or null if unreachable / arrived. */
  nextTile(tx: number, ty: number): { tx: number; ty: number } | null {
    const here = this.distanceAt(tx, ty);
    let best: { tx: number; ty: number } | null = null;
    let bestDist = here < 0 ? Infinity : here;
    for (const [dx, dy] of DIRS) {
      if (!this.passable(tx, ty, dx, dy)) continue;
      const d = this.distanceAt(tx + dx, ty + dy);
      if (d >= 0 && d < bestDist) {
        bestDist = d;
        best = { tx: tx + dx, ty: ty + dy };
      }
    }
    return best;
  }

  private passable(x: number, y: number, dx: number, dy: number): boolean {
    const { map } = this;
    if (map.isSolid(x + dx, y + dy)) return false;
    // Diagonals need both orthogonal neighbours free, so bodies don't snag corners.
    return dx === 0 || dy === 0 || (!map.isSolid(x + dx, y) && !map.isSolid(x, y + dy));
  }
}
