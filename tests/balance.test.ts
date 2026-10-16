import { describe, expect, it } from 'vitest';
import { BOSS_FLOORS, duel, SOLO_TEAMS } from '../tools/balance';

/**
 * Balance guard-rails (M9). The bot is deliberately naive (no dodging, no
 * talents or items), so these bounds are loose: they catch a class or a boss
 * drifting far out of line, not fine tuning.
 */
describe('Équilibrage (sonde)', () => {
  const results = BOSS_FLOORS.flatMap(([boss, level]) =>
    SOLO_TEAMS.map((team) => duel(boss, level, team)),
  );

  it('every class alone, without upgrades, beats every boss in under 3 minutes', () => {
    for (const r of results) expect(r.killed, `${r.team[0]} vs ${r.boss}`).toBe(true);
  });

  it('no class is more than 2× slower than the fastest one on the same boss', () => {
    for (const [boss] of BOSS_FLOORS) {
      const times = results.filter((r) => r.boss === boss).map((r) => r.seconds);
      expect(Math.max(...times) / Math.min(...times), boss).toBeLessThan(2);
    }
  });

  it('report', () => {
    const rows = results.map(
      (r) =>
        `${r.boss.padEnd(14)} ét.${r.level} ${r.team[0]!.padEnd(12)} ${r.seconds.toFixed(1).padStart(6)} s  subis ${Math.round(r.damageTaken)}`,
    );
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
      ?.env;
    if (env?.BALANCE_REPORT) console.log(rows.join('\n'));
    expect(rows.length).toBe(BOSS_FLOORS.length * SOLO_TEAMS.length);
  });
});
