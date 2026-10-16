import { CLASS_IDS, type ClassId } from '../src/data/classes';
import type { EnemyId } from '../src/data/enemies';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { emptyInput } from '../src/game/inputFrame';

/**
 * Balance probe: a simple bot (walks up, holds primary, uses skill and
 * ultimate on cooldown, switches heroes when one is low) fights one boss in
 * the test arena. Survival is NOT simulated by default (god mode) so the
 * result isolates damage output: seconds to kill.
 */
export interface DuelResult {
  boss: EnemyId;
  level: number;
  team: ClassId[];
  seconds: number;
  killed: boolean;
  /** HP the party would have lost without god mode. */
  damageTaken: number;
}

export function duel(boss: EnemyId, level: number, team: ClassId[], seed = 'BAL'): DuelResult {
  const g = new Game(seed, 1 / 60, { mode: 'arena', waves: false, party: team });
  g.godMode = true;
  const pt = g.world.req(g.player, 'transform');
  const e = spawnEnemy(g, boss, pt.x + 160, pt.y, { level });
  const maxTicks = 60 * 180;
  let t = 0;
  let switchTimer = 0;
  for (; t < maxTicks && g.world.isAlive(e); t++) {
    const bt = g.world.get(e, 'transform');
    if (!bt) break;
    const dx = bt.x - pt.x;
    const dy = bt.y - pt.y;
    const d = Math.hypot(dx, dy) || 1;
    const ranged = g.world.req(g.player, 'player').classId === 'arcanist';
    const want = ranged ? 180 : 45;
    const k = d > want + 10 ? 1 : d < want - 30 ? -1 : 0;
    const input = {
      ...emptyInput(),
      moveX: (dx / d) * k,
      moveY: (dy / d) * k,
      aimX: bt.x,
      aimY: bt.y,
      attackHeld: true,
      attackPressed: t % 20 === 0,
      skillPressed: t % 30 === 0,
      ultimatePressed: t % 30 === 15,
      rangedPressed: t % 45 === 0,
      // Rotate heroes regularly so every kit contributes, like a real player.
      switchTo: ++switchTimer % 600 === 0 ? Math.floor(switchTimer / 600) % team.length : -1,
    };
    g.step(input);
  }
  return {
    boss,
    level,
    team,
    seconds: t / 60,
    killed: !g.world.isAlive(e),
    damageTaken: g.stats.damageTaken,
  };
}

export const BOSS_FLOORS: [EnemyId, number][] = [
  ['ossuaryWarden', 3],
  ['cryptarch', 3],
  ['thornMother', 6],
  ['paleStag', 6],
  ['fallenSmith', 9],
  ['forgeHeart', 9],
];

export const SOLO_TEAMS: ClassId[][] = CLASS_IDS.map((id) => [id]);
