export type Entity = number;

/** Maps a tuple of component keys to the tuple of their component types. */
type ComponentTuple<C, K extends readonly (keyof C)[]> = { [I in keyof K]: C[K[I]] };

/**
 * Minimal ECS store. `C` is a map { componentName: ComponentData }.
 * Components are plain data; logic lives in systems that query the world.
 * One Map per component type keeps queries cheap for the entity counts of a
 * roguelike (hundreds), without the complexity of archetypes.
 */
export class World<C extends object> {
  private nextId: Entity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<keyof C, Map<Entity, unknown>>();
  private readonly destroyQueue = new Set<Entity>();

  create(): Entity {
    const e = this.nextId++;
    this.alive.add(e);
    return e;
  }

  isAlive(e: Entity): boolean {
    return this.alive.has(e);
  }

  get entityCount(): number {
    return this.alive.size;
  }

  add<K extends keyof C>(e: Entity, key: K, data: C[K]): C[K] {
    if (!this.alive.has(e)) throw new Error(`add(${String(key)}) on dead entity ${e}`);
    this.store(key).set(e, data);
    return data;
  }

  get<K extends keyof C>(e: Entity, key: K): C[K] | undefined {
    return this.stores.get(key)?.get(e) as C[K] | undefined;
  }

  /** Like `get` but throws: use when the component is a system invariant. */
  req<K extends keyof C>(e: Entity, key: K): C[K] {
    const c = this.get(e, key);
    if (c === undefined) throw new Error(`Entity ${e} has no ${String(key)}`);
    return c;
  }

  has(e: Entity, key: keyof C): boolean {
    return this.stores.get(key)?.has(e) ?? false;
  }

  remove(e: Entity, key: keyof C): void {
    this.stores.get(key)?.delete(e);
  }

  /** Destruction is deferred to `flush()` so systems can iterate safely. */
  destroy(e: Entity): void {
    if (this.alive.has(e)) this.destroyQueue.add(e);
  }

  isPendingDestroy(e: Entity): boolean {
    return this.destroyQueue.has(e);
  }

  flush(): void {
    for (const e of this.destroyQueue) {
      for (const store of this.stores.values()) store.delete(e);
      this.alive.delete(e);
    }
    this.destroyQueue.clear();
  }

  /**
   * Entities that have all the given components, with their data.
   * Iterates a snapshot of the smallest store, so adding/removing components
   * while looping is safe. Entities queued for destruction are skipped.
   */
  query<const K extends readonly (keyof C)[]>(...keys: K): [Entity, ...ComponentTuple<C, K>][] {
    if (keys.length === 0) return [];
    const stores = keys.map((k) => this.store(k));
    let smallest = stores[0] as Map<Entity, unknown>;
    for (const s of stores) if (s.size < smallest.size) smallest = s;

    const out: [Entity, ...ComponentTuple<C, K>][] = [];
    outer: for (const e of Array.from(smallest.keys())) {
      if (this.destroyQueue.has(e)) continue;
      const row: unknown[] = [e];
      for (const s of stores) {
        const c = s.get(e);
        if (c === undefined) continue outer;
        row.push(c);
      }
      out.push(row as [Entity, ...ComponentTuple<C, K>]);
    }
    return out;
  }

  /** First matching entity, convenient for singletons (player, camera target…). */
  first<const K extends readonly (keyof C)[]>(
    ...keys: K
  ): [Entity, ...ComponentTuple<C, K>] | undefined {
    return this.query(...keys)[0];
  }

  private store(key: keyof C): Map<Entity, unknown> {
    let s = this.stores.get(key);
    if (!s) {
      s = new Map();
      this.stores.set(key, s);
    }
    return s;
  }
}
