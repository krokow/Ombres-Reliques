import { isEnemyId, type BossEnemyDef, type BossPattern } from '../../data/enemies';
import {
  spawnEnemy,
  spawnEnemyProjectile,
  spawnExplosion,
  spawnHitbox,
} from '../../game/factories';
import { angleTo, halt, moveToward, turnTowards, type AgentCtx } from './context';

/** Index of the phase matching the current HP ratio. */
export function phaseFor(def: BossEnemyDef, ratio: number): number {
  let phase = 0;
  def.phases.forEach((p, i) => {
    if (ratio <= p.hpBelow) phase = i;
  });
  return phase;
}

/**
 * Data-driven boss: rotates through its phase's attack patterns, each with a
 * telegraphed windup; crossing an HP threshold triggers an invulnerable roar
 * and a faster, nastier rotation.
 */
export function bossBehavior(ctx: AgentCtx, def: BossEnemyDef): void {
  const { sim, e, t } = ctx;
  const w = sim.world;
  const st = w.req(e, 'boss');
  const health = w.req(e, 'health');
  health.stagger = 0;
  st.ticks++;

  const target = phaseFor(def, health.hp / health.max);
  if (target > st.phase) {
    st.phase = target;
    st.step = 'transition';
    st.ticks = 0;
    health.invuln = def.phaseTransitionTicks;
    for (const [he, hb] of w.query('hitbox')) if (hb.owner === e && hb.attached) w.destroy(he);
    sim.events.push({
      type: 'bossPhase',
      entity: e,
      phase: target,
      name: def.title,
      x: t.x,
      y: t.y,
    });
  }
  const phase = def.phases[st.phase];
  if (!phase) return;
  const pattern = phase.patterns[st.current % phase.patterns.length];

  switch (st.step) {
    case 'transition':
      halt(ctx);
      if (st.ticks >= def.phaseTransitionTicks) {
        st.step = 'rest';
        st.ticks = 0;
      }
      return;
    case 'rest': {
      if (ctx.knows) {
        turnTowards(ctx, angleTo(ctx, ctx.px, ctx.py), def.turnRate);
        // Hovers at mid range: close enough to threaten, far enough to read.
        if (ctx.dist > 140) moveToward(ctx, ctx.px, ctx.py, phase.speedMult, true);
        else halt(ctx);
      } else halt(ctx);
      if (st.ticks >= phase.restTicks && ctx.knows) {
        st.current = st.next % phase.patterns.length;
        st.next = st.current + 1;
        st.step = 'windup';
        st.ticks = 0;
        st.aimX = ctx.px;
        st.aimY = ctx.py;
        sim.events.push({ type: 'windup', entity: e });
      }
      return;
    }
    case 'windup': {
      halt(ctx);
      if (!pattern) return;
      // Tracks for the first two thirds, then commits: the dodge window.
      if (ctx.knows && st.ticks < pattern.windupTicks * 0.66) {
        st.aimX = ctx.px;
        st.aimY = ctx.py;
      }
      turnTowards(ctx, angleTo(ctx, st.aimX, st.aimY), def.turnRate * 2);
      if (st.ticks >= pattern.windupTicks) execute(ctx, pattern);
      return;
    }
    case 'active': {
      // Only charges are "active" over time.
      if (pattern?.kind !== 'charge') {
        st.step = 'rest';
        st.ticks = 0;
        return;
      }
      const r = ctx.body.radius;
      const nx = t.x + st.dirX * 8;
      const ny = t.y + st.dirY * 8;
      if (
        st.ticks >= pattern.durationTicks ||
        sim.map.rectOverlapsSolid(nx - r, ny - r, nx + r, ny + r)
      ) {
        for (const [he, hb] of w.query('hitbox')) if (hb.owner === e && hb.attached) w.destroy(he);
        ctx.v.x = 0;
        ctx.v.y = 0;
        st.step = 'rest';
        st.ticks = 0;
        return;
      }
      ctx.v.x = st.dirX * pattern.speed;
      ctx.v.y = st.dirY * pattern.speed;
      return;
    }
  }
}

function execute(ctx: AgentCtx, p: BossPattern): void {
  const { sim, e, t } = ctx;
  const st = sim.world.req(e, 'boss');
  const dmg = (n: number): number => Math.round(n * ctx.damageMult);
  const angle = angleTo(ctx, st.aimX, st.aimY);
  st.step = 'rest';
  st.ticks = 0;
  switch (p.kind) {
    case 'slam':
      spawnHitbox(sim, t.x, t.y, {
        owner: e,
        team: 'enemy',
        shape: { kind: 'circle', radius: p.radius, offset: 0 },
        angle: 0,
        damage: dmg(p.damage),
        knockback: p.knockback,
        stagger: 0,
        delay: 0,
        ticks: 6,
        attached: true,
        canCrit: false,
      });
      sim.events.push({ type: 'shockwave', x: t.x, y: t.y, radius: p.radius, color: 'violet' });
      break;
    case 'cone':
      spawnHitbox(sim, t.x, t.y, {
        owner: e,
        team: 'enemy',
        shape: { kind: 'arc', range: p.range, arc: p.arc },
        angle,
        damage: dmg(p.damage),
        knockback: p.knockback,
        stagger: 0,
        delay: 0,
        ticks: 6,
        attached: true,
        canCrit: false,
      });
      sim.events.push({
        type: 'swing',
        owner: e,
        x: t.x,
        y: t.y,
        angle,
        arc: p.arc,
        range: p.range,
        combo: 2,
      });
      break;
    case 'volley':
    case 'nova': {
      const count = p.count;
      for (let i = 0; i < count; i++) {
        const a =
          p.kind === 'nova'
            ? angle + (i / count) * Math.PI * 2
            : angle + (count === 1 ? 0 : (i / (count - 1) - 0.5) * p.spread);
        spawnEnemyProjectile(
          sim,
          e,
          t.x + Math.cos(a) * ctx.body.radius,
          t.y + Math.sin(a) * ctx.body.radius,
          a,
          { ...p.projectile, slowTicks: 0 },
          ctx.damageMult,
        );
      }
      sim.events.push({ type: 'enemyShoot', x: t.x, y: t.y, angle });
      break;
    }
    case 'summon': {
      if (!isEnemyId(p.id)) break;
      const alive = sim.world.query('minion').filter(([, m]) => m.summoner === e).length;
      const n = Math.min(p.count, Math.max(0, p.max - alive));
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        let x = t.x + Math.cos(a) * (ctx.body.radius + 20);
        let y = t.y + Math.sin(a) * (ctx.body.radius + 20);
        if (sim.map.isSolidAt(x, y)) {
          x = t.x;
          y = t.y;
        }
        const add = spawnEnemy(sim, p.id, x, y, { summoner: e, level: sim.level });
        const enc = sim.world.get(e, 'encounter');
        if (enc) sim.world.add(add, 'encounter', { room: enc.room });
        sim.events.push({ type: 'summon', x, y });
      }
      break;
    }
    case 'charge':
      st.dirX = Math.cos(angle);
      st.dirY = Math.sin(angle);
      st.step = 'active';
      ctx.facing.angle = angle;
      spawnHitbox(sim, t.x, t.y, {
        owner: e,
        team: 'enemy',
        shape: { kind: 'circle', radius: ctx.body.radius + 6, offset: 4 },
        angle,
        damage: dmg(p.damage),
        knockback: p.knockback,
        stagger: 0,
        delay: 0,
        ticks: p.durationTicks,
        attached: true,
        canCrit: false,
      });
      break;
    case 'rain':
      for (let i = 0; i < p.count; i++) {
        const a = sim.rng.ai.range(-Math.PI, Math.PI);
        const d = i === 0 ? 0 : Math.sqrt(sim.rng.ai.next()) * p.spread;
        const x = st.aimX + Math.cos(a) * d;
        const y = st.aimY + Math.sin(a) * d;
        if (sim.map.isSolidAt(x, y)) continue;
        spawnExplosion(sim, e, x, y, {
          radius: p.radius,
          damage: dmg(p.damage),
          knockback: 200,
          delayTicks: p.delayTicks + i * 4,
          creditPlayer: false,
          team: 'enemy',
        });
      }
      break;
  }
}
