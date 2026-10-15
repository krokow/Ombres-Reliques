import type { TileMap } from '../core/tilemap';

export interface TilePos {
  tx: number;
  ty: number;
}

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Binary min-heap keyed by f-score. */
class Heap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.keys[p] as number) <= key) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0] as number;
    const lastItem = this.items.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && (this.keys[l] as number) < (this.keys[m] as number)) m = l;
        if (r < this.keys.length && (this.keys[r] as number) < (this.keys[m] as number)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b] as number, this.items[a] as number];
    [this.keys[a], this.keys[b]] = [this.keys[b] as number, this.keys[a] as number];
  }
}

function canStep(map: TileMap, x: number, y: number, dx: number, dy: number): boolean {
  if (map.isSolid(x + dx, y + dy)) return false;
  // No corner cutting: diagonals need both orthogonal neighbours free.
  return dx === 0 || dy === 0 || (!map.isSolid(x + dx, y) && !map.isSolid(x, y + dy));
}

/**
 * A* on the tile grid (8-way, octile heuristic). Returns the tiles to walk
 * through, excluding the start and including the goal; [] if start === goal;
 * null if unreachable or the node budget runs out.
 */
export function findPath(
  map: TileMap,
  start: TilePos,
  goal: TilePos,
  maxNodes = 4000,
): TilePos[] | null {
  if (map.isSolid(goal.tx, goal.ty) || !map.inBounds(start.tx, start.ty)) return null;
  if (start.tx === goal.tx && start.ty === goal.ty) return [];
  const w = map.width;
  const startIdx = start.ty * w + start.tx;
  const goalIdx = goal.ty * w + goal.tx;
  const g = new Float64Array(map.width * map.height).fill(Infinity);
  const came = new Int32Array(map.width * map.height).fill(-1);
  const closed = new Uint8Array(map.width * map.height);
  const h = (x: number, y: number): number => {
    const dx = Math.abs(x - goal.tx);
    const dy = Math.abs(y - goal.ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const open = new Heap();
  g[startIdx] = 0;
  open.push(startIdx, h(start.tx, start.ty));
  let expanded = 0;

  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    if (cur === goalIdx) break;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy, cost] of DIRS) {
      if (!canStep(map, cx, cy, dx, dy)) continue;
      const n = (cy + dy) * w + cx + dx;
      if (closed[n]) continue;
      const ng = (g[cur] as number) + cost;
      if (ng < (g[n] as number)) {
        g[n] = ng;
        came[n] = cur;
        open.push(n, ng + h(cx + dx, cy + dy));
      }
    }
  }

  if (came[goalIdx] === -1) return null;
  const path: TilePos[] = [];
  for (let i = goalIdx; i !== startIdx; i = came[i] as number) {
    path.push({ tx: i % w, ty: Math.floor(i / w) });
  }
  return path.reverse();
}
