/** Elite modifiers: an elite rolls one or more of these on top of the base elite bonuses. */
export interface EliteModifierDef {
  name: string;
  hpMult?: number;
  speedMult?: number;
  damageMult?: number;
  weightMult?: number;
  /** Fraction of damage dealt to the player healed back. */
  lifesteal?: number;
  explodesOnDeath?: boolean;
  color: string;
}

export const ELITE_MODIFIERS = {
  enraged: { name: 'Enragé', speedMult: 1.3, damageMult: 1.25, color: '#ff5a3c' },
  armored: { name: 'Cuirassé', hpMult: 2, weightMult: 2.5, color: '#9fb4c8' },
  vampiric: { name: 'Vampirique', lifesteal: 0.5, color: '#e0436b' },
  volatile: { name: 'Instable', explodesOnDeath: true, color: '#ffb347' },
} as const satisfies Record<string, EliteModifierDef>;

export type EliteModifierId = keyof typeof ELITE_MODIFIERS;

export const ELITE = {
  /** Applied to every elite before modifiers. */
  hpMult: 2.2,
  radiusMult: 1.2,
  /** Death explosion of "volatile" elites. */
  deathExplosion: { radius: 56, damage: 16, knockback: 300, delayTicks: 20 },
} as const;
