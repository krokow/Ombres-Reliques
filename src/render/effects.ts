import { Rng } from '../core/rng';
import type { Entity } from '../ecs/world';
import { FEEL } from '../data/combat';
import { ENEMIES, isEnemyId } from '../data/enemies';
import type { GameEvent } from '../game/events';
import type { Camera } from './camera';
import { PALETTE } from './palette';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Velocity damping per second (exponential). */
  drag: number;
  spark: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface Slash {
  owner: Entity;
  x: number;
  y: number;
  angle: number;
  arc: number;
  range: number;
  combo: number;
  life: number;
  maxLife: number;
}

export interface Ghost {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
}

export interface Blink {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  life: number;
  maxLife: number;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

/**
 * Purely cosmetic effects driven by sim events. Uses its own RNG so visuals
 * never consume simulation randomness.
 */
export class Effects {
  private readonly rng = new Rng(0xc0ffee);
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  slashes: Slash[] = [];
  ghosts: Ghost[] = [];
  rings: Ring[] = [];
  blinks: Blink[] = [];
  /** Brief full-screen darkening when the ultimate starts. */
  ultFlash = 0;
  /** Remaining white-flash time per entity (seconds). */
  readonly flashes = new Map<Entity, number>();
  /** Full-screen red flash when the player is hurt. */
  hurtFlash = 0;
  banner: { text: string; life: number; maxLife: number } | null = null;

  handle(ev: GameEvent, camera: Camera): void {
    switch (ev.type) {
      case 'swing':
        this.slashes.push({ ...ev, life: 0.16, maxLife: 0.16 });
        break;
      case 'throw':
        this.burst(ev.x, ev.y, 3, PALETTE.shuriken, 60, 0.15, ev.angle, 0.6);
        break;
      case 'dash':
        camera.addTrauma(FEEL.shake.dash);
        this.burst(ev.x, ev.y, 10, PALETTE.dust, 90, 0.35, Math.atan2(-ev.dirY, -ev.dirX), 1.2);
        break;
      case 'hit': {
        if (ev.dot) {
          this.text(ev.x, ev.y - 12, `${ev.damage}`, PALETTE.poison, 9);
          break;
        }
        this.flashes.set(ev.target, 0.09);
        const angle = Math.atan2(ev.dirY, ev.dirX);
        if (ev.byPlayer) {
          camera.addTrauma(ev.crit ? FEEL.shake.crit : FEEL.shake.hit);
          this.burst(
            ev.x,
            ev.y,
            ev.crit ? 14 : 7,
            ev.backstab ? PALETTE.backstab : PALETTE.spark,
            ev.crit ? 320 : 220,
            0.25,
            angle,
            0.9,
            true,
          );
          this.burst(ev.x, ev.y, 4, PALETTE.ghoulBlood, 120, 0.4, angle, 1.4);
          this.text(
            ev.x,
            ev.y - 14,
            ev.backstab ? `${ev.damage} DOS !` : ev.crit ? `${ev.damage} !` : `${ev.damage}`,
            ev.backstab ? PALETTE.backstab : ev.crit ? PALETTE.crit : PALETTE.damage,
            ev.crit ? 15 : 11,
          );
        } else {
          camera.addTrauma(FEEL.shake.playerHurt);
          this.hurtFlash = 0.35;
          this.burst(ev.x, ev.y, 10, PALETTE.playerBlood, 200, 0.35, angle, 1.2);
          this.text(ev.x, ev.y - 16, `-${ev.damage}`, PALETTE.hurt, 13);
        }
        break;
      }
      case 'kill':
        camera.addTrauma(FEEL.shake.kill);
        this.flashes.delete(ev.target);
        {
          const look = isEnemyId(ev.kind) ? ENEMIES[ev.kind].palette : null;
          this.burst(ev.x, ev.y, 22, look?.body ?? PALETTE.ghoulBlood, 260, 0.6, 0, Math.PI * 2);
          this.burst(ev.x, ev.y, 10, look?.dark ?? PALETTE.ghoulDark, 140, 0.8, 0, Math.PI * 2);
        }
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 34,
          color: PALETTE.spark,
          life: 0.25,
          maxLife: 0.25,
        });
        break;
      case 'dashRefund':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 26,
          color: PALETTE.refund,
          life: 0.3,
          maxLife: 0.3,
        });
        this.text(ev.x, ev.y - 22, '+DASH', PALETTE.refund, 10);
        break;
      case 'projectileWall':
        this.burst(ev.x, ev.y, 4, PALETTE.shuriken, 110, 0.2, 0, Math.PI * 2, true);
        break;
      case 'playerDeath':
        camera.addTrauma(1);
        this.burst(ev.x, ev.y, 30, PALETTE.playerBlood, 240, 0.9, 0, Math.PI * 2);
        break;
      case 'wave':
        this.banner = { text: `Vague ${ev.wave}`, life: 1.6, maxLife: 1.6 };
        break;
      case 'explosion':
        camera.addTrauma(FEEL.shake.explosion);
        this.burst(ev.x, ev.y, 26, PALETTE.explosion, ev.radius * 5, 0.45, 0, Math.PI * 2, true);
        this.burst(ev.x, ev.y, 14, PALETTE.poison, ev.radius * 2.5, 0.8, 0, Math.PI * 2);
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: ev.radius,
          color: PALETTE.explosion,
          life: 0.3,
          maxLife: 0.3,
        });
        break;
      case 'enemyShoot':
        this.burst(ev.x, ev.y, 3, PALETTE.shuriken, 80, 0.15, ev.angle, 0.5);
        break;
      case 'summon':
        this.burst(ev.x, ev.y, 12, PALETTE.summon, 120, 0.5, -Math.PI / 2, Math.PI);
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 18,
          color: PALETTE.summon,
          life: 0.35,
          maxLife: 0.35,
        });
        break;
      case 'veil':
        this.burst(ev.x, ev.y, 24, PALETTE.dust, ev.radius * 2.5, 0.6, 0, Math.PI * 2);
        break;
      case 'ambush':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 30,
          color: PALETTE.crit,
          life: 0.35,
          maxLife: 0.35,
        });
        this.text(ev.x, ev.y - 24, 'EMBUSCADE', PALETTE.crit, 10);
        break;
      case 'ambushStrike':
        this.burst(ev.x, ev.y, 10, PALETTE.crit, 260, 0.3, 0, Math.PI * 2, true);
        break;
      case 'ultStart':
        this.ultFlash = 0.35;
        camera.addTrauma(FEEL.shake.execution);
        break;
      case 'ultFail':
        this.text(
          ev.x,
          ev.y - 24,
          ev.reason === 'energy' ? 'Énergie insuffisante' : 'Aucune cible',
          PALETTE.hudDim,
          10,
        );
        break;
      case 'blink':
        this.blinks.push({ ...ev, life: 0.25, maxLife: 0.25 });
        this.burst(ev.toX, ev.toY, 10, PALETTE.refund, 160, 0.3, 0, Math.PI * 2, true);
        camera.addTrauma(FEEL.shake.execution);
        break;
      case 'status':
      case 'windup':
        break;
    }
  }

  addGhost(x: number, y: number, angle: number): void {
    this.ghosts.push({ x, y, angle, life: 0.22, maxLife: 0.22 });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    for (const t of this.texts) {
      t.y += t.vy * dt;
      t.vy *= Math.exp(-4 * dt);
      t.life -= dt;
    }
    for (const s of this.slashes) s.life -= dt;
    for (const g of this.ghosts) g.life -= dt;
    for (const r of this.rings) r.life -= dt;
    for (const b of this.blinks) b.life -= dt;
    this.ultFlash = Math.max(0, this.ultFlash - dt);
    for (const [e, t] of this.flashes) {
      if (t - dt <= 0) this.flashes.delete(e);
      else this.flashes.set(e, t - dt);
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.banner && (this.banner.life -= dt) <= 0) this.banner = null;
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
    this.slashes = this.slashes.filter((s) => s.life > 0);
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    this.rings = this.rings.filter((r) => r.life > 0);
    this.blinks = this.blinks.filter((b) => b.life > 0);
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, a * 1.5);
      if (p.spark) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * a;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        const s = p.size * (0.4 + 0.6 * a);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.3 + 0.7 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = t.life / t.maxLife;
      // Pop in then settle.
      const scale = 1 + Math.max(0, a - 0.75) * 2.4;
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.font = `bold ${Math.round(t.size * scale)}px ui-monospace, Menlo, monospace`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0b0910';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private text(x: number, y: number, text: string, color: string, size: number): void {
    const jitter = this.rng.range(-6, 6);
    this.texts.push({ x: x + jitter, y, vy: -60, text, color, size, life: 0.75, maxLife: 0.75 });
  }

  private burst(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
    life: number,
    angle: number,
    spread: number,
    spark = false,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = angle + this.rng.range(-spread / 2, spread / 2);
      const s = speed * this.rng.range(0.35, 1);
      const l = life * this.rng.range(0.6, 1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: l,
        maxLife: l,
        size: spark ? 2 : this.rng.range(2, 4.5),
        color,
        drag: 5,
        spark,
      });
    }
  }
}
