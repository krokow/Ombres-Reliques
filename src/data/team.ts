import type { ClassId } from './classes';

/** Party & switching rules (design 2c: global cooldown + re-entry lockout). */
export const TEAM = {
  /** Default party until team selection exists (M8). */
  defaultParty: ['shadowBlade', 'guardian', 'arcanist'] satisfies ClassId[],
  /** Global cooldown between two switches. */
  switchCooldownTicks: 60,
  /** A character who just left can't come back before this. */
  reentryLockoutTicks: 240,
  /** Brief i-frames on switch-in (and longer after a KO forced switch). */
  switchInvulnTicks: 20,
  koSwitchInvulnTicks: 75,
  /** Reserve characters regenerate this fraction of max HP per second. */
  reserveRegenPerSecond: 0.01,
  /** KO'd characters come back on the next floor with this fraction of max HP. */
  descendReviveFraction: 0.3,
  /** Altar (first function, extended in M6): sacrifice HP of the active character to revive. */
  altarRevive: { hpCostFraction: 0.25, reviveFraction: 0.5, interactRange: 70 },
} as const;
