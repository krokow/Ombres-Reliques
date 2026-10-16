import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { Rng } from '../src/core/rng';
import { DIFFICULTIES, difficultyFor } from '../src/data/dungeon';
import { generateFloor } from '../src/dungeon/generate';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import { emptyStats } from '../src/game/runStats';
import { newMeta, recordRun } from '../src/save/meta';
import { rollEncounter } from '../src/systems/dungeon';
import { DT } from './helpers';

describe('Difficulté', () => {
  it('harder difficulties scale enemy HP and damage', () => {
    const n = difficultyFor(4, 'normal');
    const h = difficultyFor(4, 'hard');
    const x = difficultyFor(4, 'nightmare');
    expect(h.hpMult).toBeGreaterThan(n.hpMult);
    expect(x.damageMult).toBeGreaterThan(h.damageMult);
    const g = new Game('D', DT, { mode: 'arena', waves: false, difficulty: 'nightmare' });
    const e = spawnEnemy(g, 'ghoul', 400, 300, { level: 1 });
    expect(g.world.req(e, 'health').max).toBe(
      Math.round(ENEMIES.ghoul.maxHp * DIFFICULTIES.nightmare.enemyHp),
    );
  });

  it('harder difficulties put more enemies in combat rooms', () => {
    const f = generateFloor('DIFF', 4);
    const rooms = f.rooms.filter((r) => r.type === 'combat');
    const count = (d: 'normal' | 'nightmare'): number =>
      rooms.reduce((s, r) => s + rollEncounter(new Rng(7), f, r, d).length, 0);
    expect(count('nightmare')).toBeGreaterThan(count('normal'));
  });

  it('the difficulty travels with the save and multiplies rewards', () => {
    const g = new Game('D', DT, { difficulty: 'hard' });
    const snap = JSON.parse(JSON.stringify(g.floorSnapshot));
    expect(new Game('D', DT, { restore: snap }).difficulty).toBe('hard');
    const stats = { ...emptyStats(), deepestFloor: 5, bosses: 1 };
    const base = {
      seed: 'D',
      daily: false,
      date: '2026-10-16',
      team: [],
      stats,
      outcome: 'death' as const,
    };
    const normal = recordRun(newMeta(), [], { ...base, difficulty: 'normal' }).shards;
    const hard = recordRun(newMeta(), [], { ...base, difficulty: 'hard' }).shards;
    expect(hard).toBe(Math.round(normal * DIFFICULTIES.hard.rewards));
  });
});
