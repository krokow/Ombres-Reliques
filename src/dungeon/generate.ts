import { hashString, Rng } from '../core/rng';
import { Tile, TileMap } from '../core/tilemap';
import { BIOMES, biomeForFloor } from '../data/biomes';
import { ENGINE } from '../data/config';
import { DUNGEON } from '../data/dungeon';
import { floodFill, type Floor, type Room, type TilePos } from './floor';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BspNode extends Rect {
  left?: BspNode;
  right?: BspNode;
  room?: number;
}

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Mutable state shared by the generation steps of one attempt. */
class Builder {
  readonly map: TileMap;
  readonly roomAt: Int16Array;
  readonly rooms: Room[] = [];

  constructor(readonly rng: Rng) {
    this.map = new TileMap(DUNGEON.width, DUNGEON.height, ENGINE.tileSize, Tile.Wall);
    this.roomAt = new Int16Array(DUNGEON.width * DUNGEON.height).fill(-1);
  }

  idx(tx: number, ty: number): number {
    return ty * this.map.width + tx;
  }

  roomOf(tx: number, ty: number): number {
    return this.map.inBounds(tx, ty) ? (this.roomAt[this.idx(tx, ty)] as number) : -1;
  }

  /** Interior bounds: the outermost ring of the map always stays wall. */
  carvable(tx: number, ty: number): boolean {
    return tx >= 1 && ty >= 1 && tx < this.map.width - 1 && ty < this.map.height - 1;
  }

  addRoom(r: Rect, type: Room['type'] = 'combat'): number {
    const id = this.rooms.length;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        this.map.set(x, y, Tile.Floor);
        this.roomAt[this.idx(x, y)] = id;
      }
    }
    const cx = Math.min(r.x + Math.floor((r.w - 1) / 2), r.x + r.w - 2);
    const cy = Math.min(r.y + Math.floor((r.h - 1) / 2), r.y + r.h - 2);
    this.rooms.push({
      id,
      type,
      ...r,
      center: { tx: cx, ty: cy },
      neighbors: [],
      depth: -1,
      doors: [],
    });
    return id;
  }
}

// ---------------------------------------------------------------- BSP

function splitBsp(b: Builder, node: BspNode, depth: number): void {
  const { minLeaf, maxDepth } = DUNGEON.bsp;
  if (depth >= maxDepth) return;
  const canH = node.h >= minLeaf * 2;
  const canV = node.w >= minLeaf * 2;
  if (!canH && !canV) return;
  let horizontal: boolean;
  if (canH && !canV) horizontal = true;
  else if (canV && !canH) horizontal = false;
  else if (node.h > node.w * 1.25) horizontal = true;
  else if (node.w > node.h * 1.25) horizontal = false;
  else horizontal = b.rng.chance(0.5);

  if (horizontal) {
    const cut = b.rng.int(minLeaf, node.h - minLeaf);
    node.left = { x: node.x, y: node.y, w: node.w, h: cut };
    node.right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut };
  } else {
    const cut = b.rng.int(minLeaf, node.w - minLeaf);
    node.left = { x: node.x, y: node.y, w: cut, h: node.h };
    node.right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h };
  }
  splitBsp(b, node.left, depth + 1);
  splitBsp(b, node.right, depth + 1);
}

function placeRooms(b: Builder, node: BspNode): void {
  if (node.left && node.right) {
    placeRooms(b, node.left);
    placeRooms(b, node.right);
    return;
  }
  const { padding, minRoom, maxRoom } = DUNGEON.bsp;
  const maxW = Math.min(maxRoom, node.w - padding * 2);
  const maxH = Math.min(maxRoom, node.h - padding * 2);
  if (maxW < minRoom || maxH < minRoom) return;
  const w = b.rng.int(minRoom, maxW);
  const h = b.rng.int(minRoom, maxH);
  const x = node.x + padding + b.rng.int(0, node.w - padding * 2 - w);
  const y = node.y + padding + b.rng.int(0, node.h - padding * 2 - h);
  node.room = b.addRoom({ x, y, w, h });
}

function roomsUnder(node: BspNode): number[] {
  if (node.room !== undefined) return [node.room];
  return [
    ...(node.left ? roomsUnder(node.left) : []),
    ...(node.right ? roomsUnder(node.right) : []),
  ];
}

// ---------------------------------------------------------------- corridors

function carveCorridorTile(b: Builder, tx: number, ty: number): void {
  if (!b.carvable(tx, ty) || b.roomOf(tx, ty) >= 0) return;
  b.map.set(tx, ty, Tile.Floor);
}

/** L-shaped corridor, `corridorWidth` tiles wide, between two room centres. */
function carveCorridor(b: Builder, a: number, c: number): void {
  const A = b.rooms[a]?.center;
  const C = b.rooms[c]?.center;
  if (!A || !C) return;
  const wdt = DUNGEON.corridorWidth;
  const hFirst = b.rng.chance(0.5);
  const corner = hFirst ? { tx: C.tx, ty: A.ty } : { tx: A.tx, ty: C.ty };
  const segment = (p: TilePos, q: TilePos): void => {
    const x0 = Math.min(p.tx, q.tx);
    const x1 = Math.max(p.tx, q.tx) + wdt - 1;
    const y0 = Math.min(p.ty, q.ty);
    const y1 = Math.max(p.ty, q.ty) + wdt - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) carveCorridorTile(b, x, y);
  };
  segment(A, corner);
  segment(corner, C);
}

function connectTree(b: Builder, node: BspNode): number[] {
  if (!node.left || !node.right) return roomsUnder(node);
  const L = connectTree(b, node.left);
  const R = connectTree(b, node.right);
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const a of L) {
    for (const c of R) {
      const A = b.rooms[a]?.center;
      const C = b.rooms[c]?.center;
      if (!A || !C) continue;
      const d = Math.abs(A.tx - C.tx) + Math.abs(A.ty - C.ty);
      if (d < bestD) {
        bestD = d;
        best = [a, c];
      }
    }
  }
  if (best) carveCorridor(b, best[0], best[1]);
  return [...L, ...R];
}

function addLoops(b: Builder): void {
  const loops = Math.round(b.rooms.length * DUNGEON.extraLoops);
  for (let i = 0; i < loops; i++) {
    const a = b.rng.int(0, b.rooms.length - 1);
    const A = b.rooms[a]?.center;
    if (!A) continue;
    const others = b.rooms
      .filter((r) => r.id !== a)
      .sort(
        (r1, r2) =>
          Math.abs(r1.center.tx - A.tx) +
          Math.abs(r1.center.ty - A.ty) -
          (Math.abs(r2.center.tx - A.tx) + Math.abs(r2.center.ty - A.ty)),
      );
    // Second or third closest: the closest is usually already connected.
    const target = others[b.rng.int(1, Math.min(2, others.length - 1))];
    if (target) carveCorridor(b, a, target.id);
  }
}

/** Corridor tiles touching a room become doors; the room graph is read back from the tiles. */
function deriveDoorsAndGraph(b: Builder): void {
  const { map } = b;
  for (let ty = 1; ty < map.height - 1; ty++) {
    for (let tx = 1; tx < map.width - 1; tx++) {
      if (map.get(tx, ty) !== Tile.Floor || b.roomOf(tx, ty) >= 0) continue;
      for (const [dx, dy] of DIRS4) {
        const r = b.roomOf(tx + dx, ty + dy);
        if (r >= 0) {
          map.set(tx, ty, Tile.DoorOpen);
          b.rooms[r]?.doors.push({ tx, ty });
          break;
        }
      }
    }
  }
  // Corridor components: every room touched by the same component is connected.
  const seen = new Uint8Array(map.width * map.height);
  for (let i = 0; i < seen.length; i++) {
    const tx = i % map.width;
    const ty = (i - tx) / map.width;
    if (seen[i] || b.roomOf(tx, ty) >= 0 || map.isSolid(tx, ty)) continue;
    const comp = floodFill(map, { tx, ty }, (x, y) => b.roomOf(x, y) < 0 && !map.isSolid(x, y));
    const touched = new Set<number>();
    for (let j = 0; j < comp.length; j++) {
      if (!comp[j]) continue;
      seen[j] = 1;
      const x = j % map.width;
      const y = (j - x) / map.width;
      for (const [dx, dy] of DIRS4) {
        const r = b.roomOf(x + dx, y + dy);
        if (r >= 0) touched.add(r);
      }
    }
    const list = [...touched];
    for (const r of list) {
      const room = b.rooms[r];
      if (!room) continue;
      for (const o of list) if (o !== r && !room.neighbors.includes(o)) room.neighbors.push(o);
    }
  }
}

function bfsDepths(b: Builder, start: number): number[] {
  const depth = b.rooms.map(() => -1);
  depth[start] = 0;
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const r = queue[h] as number;
    for (const n of b.rooms[r]?.neighbors ?? []) {
      if (depth[n] !== -1) continue;
      depth[n] = (depth[r] as number) + 1;
      queue.push(n);
    }
  }
  return depth;
}

/** Start at one end of the graph; boss = deepest dead end, reachable only through the mini-boss. */
function assignRoles(b: Builder): { start: number; miniboss: number; boss: number } | null {
  const seedRoom = b.rng.int(0, b.rooms.length - 1);
  const fromSeed = bfsDepths(b, seedRoom);
  const start = fromSeed.indexOf(Math.max(...fromSeed));
  const depth = bfsDepths(b, start);
  if (depth.some((d) => d < 0)) return null;
  b.rooms.forEach((r, i) => (r.depth = depth[i] as number));

  const bossCandidates = b.rooms
    .filter(
      (r) =>
        r.neighbors.length === 1 &&
        r.id !== start &&
        r.depth >= DUNGEON.minBossDepth &&
        r.w * r.h >= 49,
    )
    .sort((r1, r2) => r2.depth - r1.depth || r1.id - r2.id);
  for (const boss of bossCandidates) {
    const miniboss = boss.neighbors[0] as number;
    if (miniboss === start) continue;
    return { start, miniboss, boss: boss.id };
  }
  return null;
}

function assignSpecials(b: Builder, reserved: Set<number>): void {
  const free = b.rooms.filter((r) => !reserved.has(r.id));
  // Dead ends first: treasure/shop/altar feel like detours.
  const deadEnds = b.rng.shuffle(free.filter((r) => r.neighbors.length === 1));
  const others = b.rng.shuffle(free.filter((r) => r.neighbors.length !== 1));
  const queue = [...deadEnds, ...others];
  const [tMin, tMax] = DUNGEON.specials.treasure;
  const wanted: Room['type'][] = [
    ...Array<Room['type']>(DUNGEON.specials.shop).fill('shop'),
    ...Array<Room['type']>(DUNGEON.specials.altar).fill('altar'),
    ...Array<Room['type']>(b.rng.int(tMin, tMax)).fill('treasure'),
  ];
  // Keep at least two combat rooms.
  for (const type of wanted) {
    if (queue.length <= 2) break;
    const room = queue.shift();
    if (room) room.type = type;
  }
}

// ---------------------------------------------------------------- secret room

function placeSecretRoom(
  b: Builder,
  forbidden: Set<number>,
): { room: number; cracked: TilePos[] } | null {
  const { minSize, maxSize } = DUNGEON.secretRoom;
  const hosts = b.rng.shuffle(b.rooms.filter((r) => !forbidden.has(r.id)));
  const allWall = (x0: number, y0: number, x1: number, y1: number): boolean => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++)
        if (!b.carvable(x, y) || b.map.get(x, y) !== Tile.Wall) return false;
    }
    return true;
  };
  for (const host of hosts) {
    const s = b.rng.int(minSize, maxSize);
    const sides = b.rng.shuffle([0, 1, 2, 3]);
    for (const side of sides) {
      // Opening (2 cracked tiles) somewhere along the shared side.
      const along = side < 2 ? host.h : host.w;
      if (along < 2) continue;
      const off = b.rng.int(0, along - 2);
      let rect: Rect;
      let cracked: TilePos[];
      if (side === 0 || side === 1) {
        const wx = side === 0 ? host.x + host.w : host.x - 1;
        const cy = host.y + off;
        const rx = side === 0 ? wx + 1 : wx - s;
        rect = { x: rx, y: cy - b.rng.int(0, s - 2), w: s, h: s };
        cracked = [
          { tx: wx, ty: cy },
          { tx: wx, ty: cy + 1 },
        ];
      } else {
        const wy = side === 2 ? host.y + host.h : host.y - 1;
        const cx = host.x + off;
        const ry = side === 2 ? wy + 1 : wy - s;
        rect = { x: cx - b.rng.int(0, s - 2), y: ry, w: s, h: s };
        cracked = [
          { tx: cx, ty: wy },
          { tx: cx + 1, ty: wy },
        ];
      }
      if (!allWall(rect.x - 1, rect.y - 1, rect.x + rect.w, rect.y + rect.h)) continue;
      if (!cracked.every((c) => b.map.get(c.tx, c.ty) === Tile.Wall && b.roomOf(c.tx, c.ty) < 0))
        continue;
      // The cracked wall must be exactly between the two rooms.
      const touchesHost = cracked.every((c) =>
        DIRS4.some(([dx, dy]) => b.roomOf(c.tx + dx, c.ty + dy) === host.id),
      );
      if (!touchesHost) continue;
      const id = b.addRoom(rect, 'secret');
      for (const c of cracked) b.map.set(c.tx, c.ty, Tile.Cracked);
      const secret = b.rooms[id];
      if (secret) secret.neighbors.push(host.id);
      return { room: id, cracked };
    }
  }
  return null;
}

// ---------------------------------------------------------------- dressing (random walks)

function roomTilesConnected(b: Builder, room: Room): boolean {
  const tiles: number[] = [];
  for (let i = 0; i < b.roomAt.length; i++)
    if (b.roomAt[i] === room.id && b.map.tiles[i] === Tile.Floor) tiles.push(i);
  const first = tiles[0];
  if (first === undefined) return false;
  const w = b.map.width;
  const fill = floodFill(
    b.map,
    { tx: first % w, ty: Math.floor(first / w) },
    (x, y) => b.roomOf(x, y) === room.id && !b.map.isSolid(x, y),
  );
  return tiles.every((i) => fill[i] === 1);
}

/** Grows a room outwards with random walks, never touching another room or corridor. */
function erode(b: Builder, room: Room, walks: number, length: number): void {
  const canCarve = (tx: number, ty: number): boolean => {
    if (!b.carvable(tx, ty) || b.map.get(tx, ty) !== Tile.Wall) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = b.map.get(tx + dx, ty + dy);
        const r = b.roomOf(tx + dx, ty + dy);
        if (t !== Tile.Wall && r !== room.id) return false;
      }
    }
    // Bumpy borders, not tentacles: stay close to the original rectangle.
    const ex = Math.max(room.x - tx, tx - (room.x + room.w - 1), 0);
    const ey = Math.max(room.y - ty, ty - (room.y + room.h - 1), 0);
    if (ex > DUNGEON.erosionMaxDepth || ey > DUNGEON.erosionMaxDepth) return false;
    // Keep a 2-tile wall margin to the map border for the wall look.
    return tx >= 2 && ty >= 2 && tx < b.map.width - 2 && ty < b.map.height - 2;
  };
  for (let i = 0; i < walks; i++) {
    // Start on a random side and lean outwards so the border actually gets eaten.
    const side = b.rng.int(0, 3);
    const [ox, oy] = DIRS4[side] ?? [1, 0];
    let x = ox === 1 ? room.x + room.w - 1 : ox === -1 ? room.x : room.x + b.rng.int(0, room.w - 1);
    let y = oy === 1 ? room.y + room.h - 1 : oy === -1 ? room.y : room.y + b.rng.int(0, room.h - 1);
    for (let s = 0; s < length; s++) {
      const [dx, dy] = b.rng.chance(0.4) ? [ox, oy] : b.rng.pick(DIRS4);
      const nx = x + dx;
      const ny = y + dy;
      if (b.roomOf(nx, ny) === room.id) {
        x = nx;
        y = ny;
      } else if (canCarve(nx, ny)) {
        b.map.set(nx, ny, Tile.Floor);
        b.roomAt[b.idx(nx, ny)] = room.id;
        x = nx;
        y = ny;
      }
    }
  }
}

/** Interior tile where cover may go: away from walls, doors and the room centre. */
function obstacleAllowed(b: Builder, room: Room, tx: number, ty: number): boolean {
  if (tx < room.x + 2 || ty < room.y + 2 || tx > room.x + room.w - 3 || ty > room.y + room.h - 3)
    return false;
  if (Math.abs(tx - room.center.tx) <= 1 && Math.abs(ty - room.center.ty) <= 1) return false;
  if (room.doors.some((d) => Math.abs(d.tx - tx) + Math.abs(d.ty - ty) <= 3)) return false;
  return b.map.get(tx, ty) === Tile.Floor && b.roomOf(tx, ty) === room.id;
}

/** Places a wall group, reverting it if it would split the room. */
function tryWalls(b: Builder, room: Room, tiles: TilePos[]): void {
  const placed = tiles.filter((t) => obstacleAllowed(b, room, t.tx, t.ty));
  for (const t of placed) b.map.set(t.tx, t.ty, Tile.Wall);
  if (!roomTilesConnected(b, room)) for (const t of placed) b.map.set(t.tx, t.ty, Tile.Floor);
}

function dress(b: Builder, room: Room, biome: (typeof BIOMES)[keyof typeof BIOMES]): void {
  const d = biome.dressing;
  const calm = room.type !== 'combat' && room.type !== 'miniboss' && room.type !== 'boss';
  if (room.type !== 'secret' && room.type !== 'shop')
    erode(b, room, d.erosionWalks, d.erosionLength);
  if (calm) return;
  if (d.pillarSpacing > 0 && room.w >= 9 && room.h >= 9) {
    for (let y = room.y + 2; y < room.y + room.h - 2; y += d.pillarSpacing) {
      for (let x = room.x + 2; x < room.x + room.w - 2; x += d.pillarSpacing)
        tryWalls(b, room, [{ tx: x, ty: y }]);
    }
  }
  if (room.type === 'boss') return; // keep the boss arena readable
  for (let i = 0; i < d.obstacleWalks; i++) {
    const tiles: TilePos[] = [];
    let x = room.x + b.rng.int(2, Math.max(2, room.w - 3));
    let y = room.y + b.rng.int(2, Math.max(2, room.h - 3));
    for (let s = 0; s < d.obstacleLength; s++) {
      tiles.push({ tx: x, ty: y });
      const [dx, dy] = b.rng.pick(DIRS4);
      x += dx;
      y += dy;
    }
    tryWalls(b, room, tiles);
  }
}

// ---------------------------------------------------------------- validation

/** Returns the list of broken invariants (empty = valid). Also used by the tests. */
export function validateFloor(floor: Floor): string[] {
  const problems: string[] = [];
  const { map, rooms } = floor;
  const passable = (x: number, y: number): boolean => !map.isSolid(x, y);
  const withSecrets = (x: number, y: number): boolean =>
    passable(x, y) || map.get(x, y) === Tile.Cracked;
  const reach = floodFill(map, floor.spawn, passable);
  const reachAll = floodFill(map, floor.spawn, withSecrets);

  if (map.isSolid(floor.spawn.tx, floor.spawn.ty)) problems.push('spawn is solid');
  for (let i = 0; i < map.tiles.length; i++) {
    const tx = i % map.width;
    const ty = (i - tx) / map.width;
    const room = floor.roomAt[i] as number;
    if (passable(tx, ty) || map.get(tx, ty) === Tile.Cracked) {
      if (!reachAll[i]) problems.push(`unreachable tile ${tx},${ty}`);
      if (room !== floor.secretRoom && !reach[i] && map.get(tx, ty) !== Tile.Cracked) {
        problems.push(`tile ${tx},${ty} needs the secret wall`);
      }
    }
    if (problems.length > 5) return problems;
  }
  const boss = rooms[floor.bossRoom];
  const mini = rooms[floor.minibossRoom];
  if (!boss || boss.type !== 'boss') problems.push('no boss room');
  if (!mini || mini.type !== 'miniboss') problems.push('no miniboss room');
  if (boss && (boss.neighbors.length !== 1 || boss.neighbors[0] !== floor.minibossRoom)) {
    problems.push('boss room must be a dead end behind the miniboss');
  }
  if (floor.minibossRoom === floor.startRoom) problems.push('miniboss in start room');
  // The miniboss room is a mandatory checkpoint: blocking it cuts the boss off.
  if (boss && mini) {
    const blocked = floodFill(
      map,
      floor.spawn,
      (x, y) =>
        passable(x, y) &&
        floor.roomAt[y * map.width + x] !== mini.id &&
        !mini.doors.some((d) => d.tx === x && d.ty === y),
    );
    if (blocked[floor.map.width * boss.center.ty + boss.center.tx])
      problems.push('boss reachable without the miniboss');
  }
  if (rooms.filter((r) => r.type !== 'secret').length < DUNGEON.minRooms)
    problems.push('too few rooms');
  return problems;
}

// ---------------------------------------------------------------- entry point

function attemptFloor(seed: string, level: number, attempt: number): Floor | null {
  const rng = new Rng(hashString(`${seed}:floor:${level}:${attempt}`));
  const b = new Builder(rng);
  const root: BspNode = { x: 1, y: 1, w: DUNGEON.width - 2, h: DUNGEON.height - 2 };
  splitBsp(b, root, 0);
  placeRooms(b, root);
  if (b.rooms.length < DUNGEON.minRooms) return null;
  connectTree(b, root);
  addLoops(b);
  deriveDoorsAndGraph(b);

  const roles = assignRoles(b);
  if (!roles) return null;
  const set = (id: number, type: Room['type']): void => {
    const r = b.rooms[id];
    if (r) r.type = type;
  };
  set(roles.start, 'start');
  set(roles.miniboss, 'miniboss');
  set(roles.boss, 'boss');
  assignSpecials(b, new Set([roles.start, roles.miniboss, roles.boss]));
  const secret = placeSecretRoom(b, new Set([roles.boss, roles.miniboss]));

  const biomeId = biomeForFloor(level);
  for (const room of b.rooms) dress(b, room, BIOMES[biomeId]);

  const start = b.rooms[roles.start];
  if (!start) return null;
  const floor: Floor = {
    level,
    biome: biomeId,
    map: b.map,
    rooms: b.rooms,
    roomAt: b.roomAt,
    startRoom: roles.start,
    minibossRoom: roles.miniboss,
    bossRoom: roles.boss,
    secretRoom: secret?.room ?? -1,
    cracked: secret?.cracked ?? [],
    spawn: start.center,
    explored: new Uint8Array(b.map.width * b.map.height),
    attempt,
  };
  if (validateFloor(floor).length > 0) return null;
  b.map.version = 0;
  return floor;
}

/**
 * Generates floor `level` of a run. Deterministic: the same (seed, level)
 * always yields the same floor. Invalid layouts are discarded and retried
 * with the next attempt index (also deterministic).
 */
export function generateFloor(seed: string, level: number): Floor {
  for (let attempt = 0; attempt < DUNGEON.maxAttempts; attempt++) {
    const floor = attemptFloor(seed, level, attempt);
    if (floor) return floor;
  }
  throw new Error(`Floor generation failed for seed ${seed}, level ${level}`);
}
