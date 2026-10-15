/** Hashes an arbitrary string into a well-mixed unsigned 32-bit integer. */
export function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Normalises user-typed seeds so "abc " and "ABC" give the same run. */
export function normalizeSeed(seed: string): string {
  return seed.trim().toUpperCase();
}

/** Formats a 32-bit integer as a short, readable seed (base 36). */
export function seedFromNumber(n: number): string {
  return (n >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

/**
 * Seedable PRNG (mulberry32). Never use Math.random in the simulation:
 * every random draw goes through an Rng so a seed fully reproduces a run.
 */
export class Rng {
  private state: number;

  constructor(
    /** The seed this stream was created from, used to derive forks. */
    readonly seed: number,
  ) {
    this.state = seed >>> 0;
  }

  static fromString(seed: string): Rng {
    return new Rng(hashString(normalizeSeed(seed)));
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks according to positive weights. */
  weighted<T>(entries: readonly { readonly weight: number; readonly value: T }[]): T {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (entries.length === 0 || total <= 0) throw new Error('Rng.weighted needs positive weights');
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    return (entries[entries.length - 1] as { value: T }).value;
  }

  /** Fisher–Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
    return items;
  }

  /**
   * Independent sub-stream derived from the seed and a label, not from the
   * current state: adding a draw to combat never shifts the dungeon layout or loot.
   */
  fork(label: string): Rng {
    return new Rng(hashString(`${this.seed}:${label}`));
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}
