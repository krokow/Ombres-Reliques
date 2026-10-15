/** Status effects. Effects are fixed per status; instances only carry a duration and a source. */
export interface StatusDef {
  name: string;
  /** Multiplies movement speed. */
  moveMult?: number;
  /** Multiplies all damage taken. */
  damageTakenMult?: number;
  /** Multiplies damage dealt by the affected entity. */
  damageDealtMult?: number;
  /** AI drops ranged kiting and closes in on the player. */
  forcesApproach?: boolean;
  /** Cannot act (AI frozen, attacks interrupted). */
  stuns?: boolean;
  /** Damage over time, applied every `intervalTicks`. */
  dot?: { damage: number; intervalTicks: number };
  color: string;
}

export const STATUSES = {
  slow: { name: 'Ralenti', moveMult: 0.55, color: '#6fb6ff' },
  stun: { name: 'Étourdi', stuns: true, color: '#ffe14d' },
  poison: { name: 'Peste', dot: { damage: 3, intervalTicks: 30 }, color: '#9bd46a' },
  burn: { name: 'Brûlure', dot: { damage: 4, intervalTicks: 20 }, color: '#ff8a3d' },
  mark: { name: 'Marqué', damageTakenMult: 1.15, color: '#d38bff' },
  empowered: { name: 'Galvanisé', damageDealtMult: 1.25, color: '#ff8a3d' },
  taunted: { name: 'Provoqué', damageDealtMult: 0.7, forcesApproach: true, color: '#ffcf5a' },
  invisible: { name: 'Invisible', color: '#7ff6ff' },
  /** Next landed attack is a guaranteed crit (granted when leaving the smoke veil). */
  ambush: { name: 'Embuscade', color: '#ffd34d' },
} as const satisfies Record<string, StatusDef>;

export type StatusId = keyof typeof STATUSES;

export interface StatusApplication {
  id: StatusId;
  ticks: number;
}
