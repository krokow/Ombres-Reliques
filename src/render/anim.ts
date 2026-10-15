import { damp } from '../core/math';
import type { Entity } from '../ecs/world';
import type { GameEvent } from '../game/events';
import type { Game } from '../game/game';

/** Procedural animation state of one actor (render-only, never read by the sim). */
export interface AnimState {
  /** Walk cycle phase (radians). */
  walk: number;
  /** Smoothed movement intensity 0..1. */
  move: number;
  /** Body tilt towards the movement direction (radians). */
  lean: number;
  /** Squash & stretch spring: scale is (1 + s, 1 - s). */
  squash: number;
  squashVel: number;
  /** Hit recoil offset (px), decays quickly. */
  recoilX: number;
  recoilY: number;
  /** 0 → 1 pop-in after spawning or switching in. */
  spawn: number;
}

const SPRING_K = 260;
const SPRING_DAMP = 14;

/**
 * Drives cheap but lively procedural animation: walk bob, breathing,
 * squash & stretch on a spring, recoil and pop-in. Attack poses are derived
 * directly from the simulation state by the sprites.
 */
export class Animator {
  private readonly states = new Map<Entity, AnimState>();

  get(e: Entity): AnimState {
    let s = this.states.get(e);
    if (!s) {
      s = { walk: 0, move: 0, lean: 0, squash: 0, squashVel: 0, recoilX: 0, recoilY: 0, spawn: 0 };
      this.states.set(e, s);
    }
    return s;
  }

  /** Kick the squash spring: positive = stretch, negative = squash. */
  kick(e: Entity, amount: number): void {
    this.get(e).squashVel += amount;
  }

  onEvent(ev: GameEvent, game: Game): void {
    switch (ev.type) {
      case 'hit': {
        const s = this.get(ev.target);
        const k = ev.dot ? 0 : ev.crit ? 7 : 4;
        s.recoilX += ev.dirX * k;
        s.recoilY += ev.dirY * k;
        s.squashVel -= ev.dot ? 0.4 : 2.2;
        break;
      }
      case 'swing':
        this.kick(ev.owner, ev.combo === 2 ? 3 : 2);
        break;
      case 'dash':
      case 'blink':
        this.kick(game.player, 4);
        break;
      case 'switch':
        this.get(game.player).spawn = 0;
        this.kick(game.player, 5);
        break;
      case 'cast':
      case 'throw':
        this.kick(game.player, 1.2);
        break;
      case 'shockwave':
      case 'taunt':
        this.kick(game.player, -4);
        break;
      case 'windup':
        this.kick(ev.entity, -1.5);
        break;
      default:
        break;
    }
  }

  update(game: Game, dt: number): void {
    const w = game.world;
    for (const [e, , v] of w.query('renderable', 'velocity', 'body')) {
      const s = this.get(e);
      const maxSpeed = w.get(e, 'mover')?.moveSpeed ?? 150;
      const speed = Math.hypot(v.x, v.y);
      s.move += (Math.min(1, speed / maxSpeed) - s.move) * damp(10, dt);
      s.walk += dt * (6 + 10 * s.move) * s.move;
      const targetLean = maxSpeed > 0 ? (v.x / maxSpeed) * 0.12 : 0;
      s.lean += (Math.max(-0.2, Math.min(0.2, targetLean)) - s.lean) * damp(8, dt);
      s.squashVel += (-s.squash * SPRING_K - s.squashVel * SPRING_DAMP) * dt;
      s.squash += s.squashVel * dt;
      s.squash = Math.max(-0.35, Math.min(0.35, s.squash));
      const r = Math.exp(-14 * dt);
      s.recoilX *= r;
      s.recoilY *= r;
      s.spawn = Math.min(1, s.spawn + dt * 5);
    }
    for (const e of this.states.keys()) if (!w.isAlive(e)) this.states.delete(e);
  }
}

/** Applies an actor's animation transform around its centre; call inside save/restore. */
export function applyAnim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: AnimState,
  time: number,
): void {
  const bob = Math.abs(Math.sin(s.walk)) * -2.2 * s.move;
  const breathe = Math.sin(time * 2.4) * 0.025 * (1 - s.move);
  // Pop-in with a little overshoot.
  const p = s.spawn;
  const pop = p >= 1 ? 1 : 0.4 + 0.6 * p + Math.sin(p * Math.PI) * 0.25;
  ctx.translate(x + s.recoilX, y + s.recoilY + bob);
  ctx.rotate(s.lean);
  ctx.scale((1 + s.squash - breathe) * pop, (1 - s.squash + breathe) * pop);
}
