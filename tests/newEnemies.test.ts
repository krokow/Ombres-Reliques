import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { spawnEnemy } from '../src/game/factories';
import type { Game } from '../src/game/game';
import { dealDamage } from '../src/systems/damage';
import { hasStatus } from '../src/systems/statuses';
import { playerPos, run, runCollect, sandbox, SPAWN } from './helpers';

const hit = (g: Game, e: number, amount: number, fromX: number, fromY: number): number => {
  g.world.req(e, 'health').invuln = 0;
  return dealDamage(g, e, {
    amount,
    source: g.player,
    byPlayer: true,
    crit: false,
    backstab: false,
    dirX: 1,
    dirY: 0,
    knockback: 0,
    stagger: 0,
    dot: false,
    originX: fromX,
    originY: fromY,
  });
};

describe('Nouveaux ennemis', () => {
  it('Spectre errant: shimmers behind the player, then teleports there', () => {
    const g = sandbox();
    g.godMode = true;
    const e = spawnEnemy(g, 'wraith', SPAWN.x + 200, SPAWN.y);
    g.world.req(e, 'enemy').cooldown = 0;
    const events = runCollect(g, 90, { aimX: SPAWN.x + 300, aimY: SPAWN.y });
    expect(events.some((ev) => ev.type === 'blink')).toBe(true);
    const t = g.world.req(e, 'transform');
    const p = playerPos(g);
    // Landed close, on the player's back (they face +x).
    expect(Math.hypot(t.x - p.x, t.y - p.y)).toBeLessThan(90);
    expect(t.x).toBeLessThan(p.x + 10);
  });

  it('Porte-pavois: frontal hits are mostly blocked, flanking hits land fully', () => {
    const g = sandbox();
    const e = spawnEnemy(g, 'shieldBearer', SPAWN.x + 100, SPAWN.y);
    const t = g.world.req(e, 'transform');
    g.world.req(e, 'facing').angle = Math.PI; // facing -x
    const front = hit(g, e, 40, t.x - 50, t.y);
    const back = hit(g, e, 40, t.x + 50, t.y);
    expect(front).toBeLessThan(10);
    expect(back).toBe(40);
  });

  it('Gelée de sève: splits into droplets that keep the room encounter', () => {
    const g = sandbox();
    const e = spawnEnemy(g, 'sapJelly', SPAWN.x + 100, SPAWN.y);
    g.world.add(e, 'encounter', { room: 3 });
    hit(g, e, 9999, SPAWN.x, SPAWN.y);
    g.world.flush();
    const drops = g.world.query('enemy').filter(([, ai]) => ai.defId === 'sapDroplet');
    expect(drops).toHaveLength(ENEMIES.sapJelly.splitInto.count);
    for (const [d] of drops) expect(g.world.get(d, 'encounter')?.room).toBe(3);
  });

  it('Prêtresse des cendres: heals and empowers wounded allies', () => {
    const g = sandbox();
    g.godMode = true;
    const p = spawnEnemy(g, 'ashPriestess', SPAWN.x + 260, SPAWN.y);
    g.world.req(p, 'enemy').cooldown = 0;
    const ally = spawnEnemy(g, 'ghoul', SPAWN.x + 300, SPAWN.y + 20);
    g.world.req(ally, 'enemy').cooldown = 9999;
    const h = g.world.req(ally, 'health');
    h.hp = 5;
    const events = runCollect(g, 120);
    expect(events.some((ev) => ev.type === 'enemyHeal')).toBe(true);
    expect(h.hp).toBeGreaterThan(5);
    expect(hasStatus(g.world, ally, 'empowered')).toBe(true);
  });

  it('Fouisseur: invulnerable underground, surfaces with a blast, then exposed', () => {
    const g = sandbox();
    g.godMode = true;
    const e = spawnEnemy(g, 'burrower', SPAWN.x + 220, SPAWN.y);
    g.world.req(e, 'enemy').cooldown = 0;
    run(g, 5);
    expect(g.world.req(e, 'enemy').phase).toBe('channel');
    expect(hit(g, e, 50, SPAWN.x, SPAWN.y)).toBe(0);
    let surfaced = false;
    for (let i = 0; i < 300 && !surfaced; i++)
      surfaced = runCollect(g, 1).some((ev) => ev.type === 'explosion');
    expect(surfaced).toBe(true);
    expect(g.world.req(e, 'enemy').phase).toBe('recover');
    expect(hit(g, e, 10, SPAWN.x, SPAWN.y)).toBeGreaterThan(0);
  });
});
