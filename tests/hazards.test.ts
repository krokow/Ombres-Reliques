import { describe, expect, it } from 'vitest';
import { HAZARD_PLACEMENT, HAZARDS } from '../src/data/hazards';
import { spawnEnemy } from '../src/game/factories';
import { Game } from '../src/game/game';
import type { GameEvent } from '../src/game/events';
import { emptyInput } from '../src/game/inputFrame';
import { DT, sandbox, SPAWN } from './helpers';

function placeTrap(g: Game, kind: keyof typeof HAZARDS, x: number, y: number, timer = 0): number {
  const e = g.world.create();
  g.world.add(e, 'transform', { x, y, prevX: x, prevY: y });
  g.world.add(e, 'trap', { kind, timer });
  return e;
}

describe('Pièges', () => {
  it('floors get biome traps on open tiles, away from doors', () => {
    let total = 0;
    for (const level of [1, 4, 7]) {
      const g = new Game('TRAPS', DT, { startLevel: level });
      const d = g.dungeon!;
      const kind = HAZARD_PLACEMENT.byBiome[d.floor.biome];
      for (const [, trap, t] of g.world.query('trap', 'transform')) {
        total++;
        expect(trap.kind).toBe(kind);
        const tx = Math.floor(t.x / 32);
        const ty = Math.floor(t.y / 32);
        expect(g.map.isSolid(tx, ty)).toBe(false);
        for (const room of d.floor.rooms)
          for (const door of room.doors)
            expect(Math.abs(door.tx - tx) + Math.abs(door.ty - ty)).toBeGreaterThan(
              HAZARD_PLACEMENT.doorClearance,
            );
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('a trap warns, then hurts whoever stands on it, enemies included (credited to the party)', () => {
    const g = sandbox();
    const def = HAZARDS.vent;
    placeTrap(g, 'vent', SPAWN.x, SPAWN.y, def.periodTicks - def.activeTicks - 5);
    const enemyTrap = placeTrap(
      g,
      'spikes',
      SPAWN.x + 200,
      SPAWN.y,
      HAZARDS.spikes.periodTicks - HAZARDS.spikes.activeTicks - 5,
    );
    void enemyTrap;
    const ghoul = spawnEnemy(g, 'ghoul', SPAWN.x + 200, SPAWN.y);
    g.world.req(ghoul, 'enemy').cooldown = 9999;
    g.world.req(ghoul, 'health').hp = 1;
    g.world.req(ghoul, 'mover').moveSpeed = 0;
    const hp = g.world.req(g.player, 'health').hp;
    const out: GameEvent[] = [];
    for (let i = 0; i < 20; i++) {
      g.step(emptyInput());
      out.push(...g.drainEvents());
    }
    expect(g.world.req(g.player, 'health').hp).toBeLessThan(hp);
    expect(out.some((e) => e.type === 'trap')).toBe(true);
    expect(out.some((e) => e.type === 'kill' && e.byPlayer)).toBe(true);
  });
});
