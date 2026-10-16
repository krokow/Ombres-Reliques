import { classDef } from '../data/classes';
import type { Game } from '../game/game';
import { PALETTE } from './palette';

/** Procedural "sprites": every character is drawn from vector primitives. */

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.75, r * 1.05, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

export interface BladeLook {
  body: string;
  trim: string;
  eyes: string;
}

export function drawShadowBlade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  facing: number,
  look: BladeLook,
  opts: {
    flash: boolean;
    time: number;
    moveX: number;
    moveY: number;
    alpha: number;
    invisible: boolean;
    swing: SwingPose | null;
  },
): void {
  if (opts.invisible) {
    // Distortion: two faint, wobbling cyan copies instead of a solid body.
    for (let i = 0; i < 2; i++) {
      const wob = Math.sin(opts.time * 9 + i * 2.1) * 2.2;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.translate(x + wob, y - wob * 0.5);
      ctx.strokeStyle = look.eyes;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 + i * 0.12), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.globalAlpha = opts.invisible ? opts.alpha * 0.3 : opts.alpha;
  ctx.translate(x, y);

  // Scarf: two ribbons trailing opposite to movement, waving over time.
  const speed = Math.hypot(opts.moveX, opts.moveY);
  const back = speed > 1 ? Math.atan2(-opts.moveY, -opts.moveX) : facing + Math.PI;
  const len = r * (1.2 + Math.min(1, speed / 250) * 0.9);
  ctx.strokeStyle = look.trim;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const wave = Math.sin(opts.time * 14 + i * 1.7) * 0.35;
    const a = back + (i === 0 ? -0.25 : 0.25) + wave * 0.5;
    ctx.lineWidth = i === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(back) * r * 0.5, Math.sin(back) * r * 0.5 - r * 0.3);
    ctx.quadraticCurveTo(
      Math.cos(a + wave) * len * 0.6,
      Math.sin(a + wave) * len * 0.6 - r * 0.3,
      Math.cos(a) * len,
      Math.sin(a) * len - r * 0.2,
    );
    ctx.stroke();
  }

  ctx.rotate(facing);
  // Cloak body.
  ctx.fillStyle = opts.flash ? '#ffffff' : look.body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = opts.flash ? '#ffffff' : look.trim;
  ctx.stroke();
  // Hood point at the back.
  ctx.fillStyle = opts.flash ? '#ffffff' : look.body;
  ctx.beginPath();
  ctx.moveTo(-r * 0.75, -r * 0.5);
  ctx.lineTo(-r * 1.35, 0);
  ctx.lineTo(-r * 0.75, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Mask and glowing eyes.
  ctx.fillStyle = '#0b0910';
  ctx.beginPath();
  ctx.arc(r * 0.25, 0, r * 0.62, -1.1, 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = 6;
  ctx.fillRect(r * 0.5, -r * 0.38, r * 0.3, r * 0.16);
  ctx.fillRect(r * 0.5, r * 0.22, r * 0.3, r * 0.16);
  ctx.shadowBlur = 0;
  // Dagger: rests in reverse grip, sweeps across the front when attacking.
  const side = opts.swing && opts.swing.index % 2 === 1 ? -1 : 1;
  const daggerAngle = opts.swing ? swingAngle(opts.swing, 1.3, 1.1) * side : 0.25;
  const hand = opts.swing ? 0.95 : 0.85;
  ctx.save();
  ctx.translate(r * 0.35, r * hand * (opts.swing ? -side * 0.3 : 1));
  ctx.rotate(daggerAngle);
  ctx.strokeStyle = '#d9dcf2';
  ctx.lineWidth = opts.swing && opts.swing.phase === 'active' ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * (opts.swing ? 1.2 : 0.9), 0);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Where an attack is in its timeline (from the simulation's combo state). */
export interface SwingPose {
  phase: 'windup' | 'active' | 'recovery';
  /** 0..1 progress inside the current phase. */
  t: number;
  index: number;
}

/**
 * Weapon angle for a swing: pulled back by `back` during windup, sweeping
 * to `+through` while active, easing back during recovery.
 */
export function swingAngle(pose: SwingPose, back: number, through: number): number {
  const ease = (k: number): number => 1 - (1 - k) * (1 - k);
  if (pose.phase === 'windup') return -back * ease(pose.t);
  if (pose.phase === 'active') return -back + (back + through) * ease(pose.t);
  return through * (1 - ease(pose.t));
}

export function drawGuardian(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: BladeLook,
  opts: {
    flash: boolean;
    time: number;
    alpha: number;
    blocking: boolean;
    swing: SwingPose | null;
    shield: number;
  },
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  ctx.rotate(facing);
  const c = (col: string): string => (opts.flash ? '#ffffff' : col);
  // Mace (right hand), drawn under the body when resting.
  const maceAngle = opts.swing
    ? swingAngle(opts.swing, 2.0, 1.6) * (opts.swing.index === 1 ? -1 : 1)
    : 0.6;
  const drawMace = (): void => {
    ctx.save();
    ctx.translate(r * 0.2, r * 0.8);
    ctx.rotate(maceAngle);
    ctx.strokeStyle = '#6b5a45';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 1.3, 0);
    ctx.stroke();
    ctx.fillStyle = c('#aeb4c2');
    ctx.beginPath();
    ctx.arc(r * 1.45, 0, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c('#d8dde8');
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + opts.time * 0;
      ctx.fillRect(r * 1.45 + Math.cos(a) * r * 0.42 - 1.5, Math.sin(a) * r * 0.42 - 1.5, 3, 3);
    }
    ctx.restore();
  };
  if (!opts.swing) drawMace();
  // Armoured body.
  ctx.fillStyle = c(look.body);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c(look.trim);
  ctx.stroke();
  // Pauldrons.
  ctx.fillStyle = c('#58698a');
  ctx.beginPath();
  ctx.arc(-r * 0.15, -r * 0.85, r * 0.42, 0, Math.PI * 2);
  ctx.arc(-r * 0.15, r * 0.85, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // Helmet visor.
  ctx.fillStyle = '#0b0910';
  ctx.fillRect(r * 0.3, -r * 0.45, r * 0.35, r * 0.9);
  ctx.fillStyle = look.eyes;
  ctx.fillRect(r * 0.45, -r * 0.3, r * 0.15, r * 0.6);
  if (opts.swing) drawMace();
  // Shield: on the left arm, or raised in front while blocking.
  ctx.save();
  if (opts.blocking) {
    ctx.translate(r * 1.05, 0);
    ctx.fillStyle = c('#7c8db0');
    ctx.strokeStyle = c(look.trim);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-r * 0.9, 0, r * 1.25, -0.95, 0.95);
    ctx.arc(-r * 0.9, 0, r * 0.9, 0.95, -0.95, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.translate(r * 0.1, -r * 0.95);
    ctx.rotate(-0.4);
    ctx.fillStyle = c('#7c8db0');
    ctx.strokeStyle = c(look.trim);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.75, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  // Shield bubble (absorb pool).
  if (opts.shield > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, 0.15 + opts.shield / 200) * opts.alpha;
    ctx.strokeStyle = '#dbe8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55 + Math.sin(opts.time * 5) * 1.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawArcanist(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: BladeLook,
  opts: {
    flash: boolean;
    time: number;
    alpha: number;
    cast: number;
    channel: boolean;
    mana: number;
  },
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  ctx.rotate(facing);
  const c = (col: string): string => (opts.flash ? '#ffffff' : col);
  // Robe hem flaring backwards.
  ctx.fillStyle = c(look.body);
  ctx.beginPath();
  ctx.moveTo(r * 0.9, 0);
  ctx.quadraticCurveTo(r * 0.2, -r * 1.25, -r * 1.25, -r * 0.8);
  ctx.quadraticCurveTo(-r * 0.8, 0, -r * 1.25, r * 0.8);
  ctx.quadraticCurveTo(r * 0.2, r * 1.25, r * 0.9, 0);
  ctx.fill();
  ctx.strokeStyle = c(look.trim);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Hood + glowing eyes.
  ctx.fillStyle = c('#15223a');
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = 6;
  ctx.fillRect(r * 0.4, -r * 0.28, r * 0.18, r * 0.14);
  ctx.fillRect(r * 0.4, r * 0.14, r * 0.18, r * 0.14);
  ctx.shadowBlur = 0;
  // Staff: thrust forward when casting, raised high while channelling meteors.
  const thrust = opts.cast * r * 0.6;
  ctx.save();
  ctx.translate(r * 0.3 + thrust, r * 0.95);
  ctx.rotate(opts.channel ? -0.9 + Math.sin(opts.time * 10) * 0.1 : -0.15 - opts.cast * 0.35);
  ctx.strokeStyle = '#7a5b3a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(r * 1.1, 0);
  ctx.stroke();
  const glow = 0.4 + opts.mana * 0.6 + opts.cast * 0.6;
  ctx.fillStyle = look.trim;
  ctx.shadowColor = look.trim;
  ctx.shadowBlur = 6 + glow * 10;
  ctx.beginPath();
  ctx.arc(r * 1.2, 0, r * (0.25 + opts.cast * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  // Orbiting mana motes.
  for (let i = 0; i < 3; i++) {
    const a = opts.time * 2.5 + (i * Math.PI * 2) / 3;
    ctx.globalAlpha = opts.alpha * (0.3 + opts.mana * 0.5);
    ctx.fillStyle = '#9fc4ff';
    ctx.fillRect(Math.cos(a) * r * 1.4 - 1, Math.sin(a) * r * 1.4 - 1, 2.5, 2.5);
  }
  ctx.restore();
}

export function drawArcaneBolt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  big: boolean,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const r = big ? 7 : 4.5;
  ctx.fillStyle = 'rgba(111, 208, 255, 0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 1.5, 0, r * 2.4, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = big ? '#ffffff' : '#bff0ff';
  ctx.shadowColor = '#6fd0ff';
  ctx.shadowBlur = big ? 14 : 8;
  ctx.beginPath();
  ctx.arc(0, 0, r + Math.sin(time * 40) * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawFrostOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 6);
  ctx.fillStyle = '#e6fbff';
  ctx.shadowColor = '#9fe8ff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const rr = i % 2 === 0 ? 9 : 5;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawFire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  life: number,
  time: number,
): void {
  const fade = Math.min(1, life * 6, (1 - life) * 10 + 0.2);
  const g = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  g.addColorStop(0, `rgba(255, 200, 80, ${0.45 * fade})`);
  g.addColorStop(0.6, `rgba(255, 110, 40, ${0.3 * fade})`);
  g.addColorStop(1, 'rgba(120, 20, 10, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  // Flickering tongues.
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4;
    const d = radius * (0.2 + ((i * 37) % 10) / 14);
    const h = 6 + Math.sin(time * 12 + i) * 4;
    const fx = x + Math.cos(a) * d;
    const fy = y + Math.sin(a) * d;
    ctx.fillStyle = `rgba(255, ${150 + ((i * 23) % 80)}, 60, ${0.7 * fade})`;
    ctx.beginPath();
    ctx.moveTo(fx - 3, fy);
    ctx.quadraticCurveTo(fx, fy - h * 2, fx + 3, fy);
    ctx.fill();
  }
}

export interface GhoulLook {
  body: string;
  dark: string;
  eyes: string;
}

export function drawGhoul(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  facing: number,
  look: GhoulLook,
  opts: { flash: boolean; time: number; windup: number; striking: boolean; staggered: boolean },
): void {
  ctx.save();
  // Shiver while winding up: readable "about to strike" tell.
  const jitter = opts.windup > 0 ? Math.sin(opts.time * 90) * 1.2 * opts.windup : 0;
  ctx.translate(x + jitter, y);
  ctx.rotate(facing);
  const flash = opts.flash;

  // Claws: pulled back during windup, thrust forward when striking.
  const reach = opts.striking ? 1.35 : 0.95 - opts.windup * 0.5;
  ctx.fillStyle = flash ? '#ffffff' : look.dark;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(r * reach, side * r * 0.75, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hunched body (wider than deep).
  ctx.fillStyle = flash ? '#ffffff' : look.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.9, r * 1.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash ? '#ffffff' : look.dark;
  ctx.stroke();
  // Spine ridge.
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.75, 0);
  ctx.lineTo(-r * 0.1, 0);
  ctx.stroke();
  // Eyes.
  ctx.fillStyle = opts.staggered ? '#fff4a3' : look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = opts.windup > 0 ? 10 : 4;
  ctx.beginPath();
  ctx.arc(r * 0.5, -r * 0.3, r * 0.14, 0, Math.PI * 2);
  ctx.arc(r * 0.5, r * 0.3, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawShuriken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 30);
  ctx.fillStyle = PALETTE.shuriken;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r * 1.6 : r * 0.5;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b0910';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface EnemyLook {
  body: string;
  dark: string;
  eyes: string;
}

export function drawArcher(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  facing: number,
  look: EnemyLook,
  opts: { flash: boolean; draw: number },
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  const c = (col: string): string => (opts.flash ? '#ffffff' : col);
  // Ribcage body.
  ctx.fillStyle = c(look.body);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c(look.dark);
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, i * r * 0.35);
    ctx.lineTo(r * 0.2, i * r * 0.35);
    ctx.stroke();
  }
  // Bow, bending back with the draw.
  ctx.strokeStyle = c('#8a6a3f');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(r * 0.6, 0, r * 0.95, -1.2, 1.2);
  ctx.stroke();
  const pull = r * (0.6 - opts.draw * 0.7);
  ctx.strokeStyle = '#e8e4f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r * 0.6 + Math.cos(-1.2) * r * 0.95, Math.sin(-1.2) * r * 0.95);
  ctx.lineTo(pull, 0);
  ctx.lineTo(r * 0.6 + Math.cos(1.2) * r * 0.95, Math.sin(1.2) * r * 0.95);
  ctx.stroke();
  // Eye sockets.
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = 6;
  ctx.fillRect(r * 0.15, -r * 0.4, r * 0.25, r * 0.2);
  ctx.fillRect(r * 0.15, r * 0.2, r * 0.25, r * 0.2);
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawBloater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  look: EnemyLook,
  opts: { flash: boolean; time: number; fuse: number },
): void {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(opts.time * (6 + opts.fuse * 30)) * (0.04 + opts.fuse * 0.1);
  ctx.scale(pulse, pulse);
  ctx.fillStyle =
    opts.flash || (opts.fuse > 0 && Math.sin(opts.time * 40) > 0.6) ? '#ffffff' : look.body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Pustules.
  ctx.fillStyle = opts.fuse > 0 ? '#ffb347' : look.eyes;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.37 + 0.4;
    ctx.beginPath();
    ctx.arc(
      Math.cos(a) * r * 0.55,
      Math.sin(a) * r * 0.55,
      r * (0.12 + (i % 2) * 0.06),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

export function drawCryptomancer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  facing: number,
  look: EnemyLook,
  opts: { flash: boolean; time: number; channel: number },
): void {
  ctx.save();
  ctx.translate(x, y);
  // Rotating rune circle while channeling.
  if (opts.channel > 0) {
    ctx.save();
    ctx.rotate(opts.time * 3);
    ctx.strokeStyle = `rgba(199, 125, 255, ${0.3 + opts.channel * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.8 + opts.channel * 0.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.rotate(facing);
  // Robe: a hooded teardrop.
  ctx.fillStyle = opts.flash ? '#ffffff' : look.body;
  ctx.beginPath();
  ctx.moveTo(r * 1.1, 0);
  ctx.quadraticCurveTo(0, -r * 1.3, -r * 1.1, -r * 0.6);
  ctx.lineTo(-r * 1.1, r * 0.6);
  ctx.quadraticCurveTo(0, r * 1.3, r * 1.1, 0);
  ctx.fill();
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Floating orb.
  const bob = Math.sin(opts.time * 4) * 2;
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = 8 + opts.channel * 12;
  ctx.beginPath();
  ctx.arc(r * 0.9, r * 0.9 + bob, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(r * 0.2, -r * 0.3, r * 0.2, r * 0.18);
  ctx.fillRect(r * 0.2, r * 0.12, r * 0.2, r * 0.18);
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawBoneArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#e8e2cf';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(6, 0);
  ctx.stroke();
  ctx.fillStyle = '#6fd0ff';
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(4, -3);
  ctx.lineTo(4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Layered drifting puffs; `life` 0..1 fades in/out. */
export function drawSmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  life: number,
  time: number,
): void {
  const fade = Math.min(1, life * 6, (1 - life) * 8 + 0.15);
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + time * (0.25 + (i % 3) * 0.1);
    const d = radius * (0.25 + ((i * 37) % 10) / 18);
    const r = radius * (0.45 + ((i * 53) % 7) / 20);
    ctx.globalAlpha = 0.16 * fade;
    ctx.fillStyle = i % 2 === 0 ? '#5a5470' : '#3d3852';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d * 0.6, y + Math.sin(a) * d * 0.6, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.35 * fade;
  ctx.strokeStyle = '#7ff6ff';
  ctx.setLineDash([3, 7]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Current swing pose of the player, read from the simulation's combo state. */
export function swingPose(game: Game): SwingPose | null {
  const w = game.world;
  const combo = w.req(game.player, 'combo');
  if (combo.tick < 0) return null;
  const def = classDef(w.req(game.player, 'player').classId);
  if (!('combo' in def)) return null;
  const hit = def.combo[combo.index];
  if (!hit) return null;
  const t = combo.tick;
  if (t < hit.windupTicks)
    return { phase: 'windup', t: t / Math.max(1, hit.windupTicks), index: combo.index };
  if (t < hit.windupTicks + hit.activeTicks) {
    return { phase: 'active', t: (t - hit.windupTicks) / hit.activeTicks, index: combo.index };
  }
  return {
    phase: 'recovery',
    t: Math.min(1, (t - hit.windupTicks - hit.activeTicks) / hit.recoveryTicks),
    index: combo.index,
  };
}

export interface EnemyPose {
  flash: boolean;
  time: number;
  /** 0..1 telegraph progress of the current attack. */
  windup: number;
  /** Attacking right now (strike, charge…). */
  active: boolean;
}

function shade(flash: boolean, col: string): string {
  return flash ? '#ffffff' : col;
}

/** Armoured knight with a lance, lowered while charging. */
export function drawKnight(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose,
): void {
  ctx.save();
  ctx.rotate(facing);
  const lance = pose.active ? 1.9 : 1.2 - pose.windup * 0.4;
  ctx.strokeStyle = shade(pose.flash, '#b9bccb');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, r * 0.55);
  ctx.lineTo(r * lance, r * 0.55 - (pose.active ? r * 0.5 : 0));
  ctx.stroke();
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(pose.flash, look.dark);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Plume and visor.
  ctx.fillStyle = shade(pose.flash, look.dark);
  ctx.fillRect(-r * 1.1, -r * 0.18, r * 0.6, r * 0.36);
  ctx.fillStyle = '#0b0910';
  ctx.fillRect(r * 0.35, -r * 0.35, r * 0.3, r * 0.7);
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = pose.windup > 0 ? 10 : 4;
  ctx.fillRect(r * 0.45, -r * 0.2, r * 0.12, r * 0.4);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Four-legged beast (wolf, stag, bull): legs cycle with time, horns for big ones. */
export function drawBeast(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose,
): void {
  ctx.save();
  ctx.rotate(facing);
  const gait = Math.sin(pose.time * (pose.active ? 30 : 12)) * r * 0.25;
  ctx.fillStyle = shade(pose.flash, look.dark);
  for (const [lx, ly, ph] of [
    [0.5, -0.7, 1],
    [0.5, 0.7, -1],
    [-0.6, -0.7, -1],
    [-0.6, 0.7, 1],
  ] as const) {
    ctx.beginPath();
    ctx.arc(r * lx + gait * ph, r * ly, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  // Long body, crouched while winding up.
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.ellipse(-r * 0.1 - pose.windup * r * 0.15, 0, r * 1.15, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(pose.flash, look.dark);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Head + horns/antlers for larger beasts.
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.arc(r * 0.95, 0, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (r >= 14) {
    ctx.strokeStyle = shade(pose.flash, look.dark);
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 1.05, side * r * 0.3);
      ctx.lineTo(r * 1.5, side * r * 0.75);
      ctx.lineTo(r * 1.75, side * r * 0.55);
      ctx.stroke();
    }
  }
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = pose.windup > 0 ? 10 : 4;
  ctx.fillRect(r * 1.1, -r * 0.22, r * 0.14, r * 0.12);
  ctx.fillRect(r * 1.1, r * 0.1, r * 0.14, r * 0.12);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Hulking golem: blocky body, glowing cracks, fists raised during windup. */
export function drawGolem(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose,
): void {
  ctx.save();
  ctx.rotate(facing);
  const raise = pose.active ? 1.3 : 0.9 - pose.windup * 0.5;
  ctx.fillStyle = shade(pose.flash, look.dark);
  for (const side of [-1, 1]) {
    ctx.fillRect(r * raise - r * 0.3, side * r * 0.85 - r * 0.3, r * 0.6, r * 0.6);
  }
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, -r * 0.8);
  ctx.lineTo(r * 0.7, -r * 0.95);
  ctx.lineTo(r * 0.95, 0);
  ctx.lineTo(r * 0.7, r * 0.95);
  ctx.lineTo(-r * 0.9, r * 0.8);
  ctx.lineTo(-r * 1.05, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(pose.flash, look.dark);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = look.eyes;
  ctx.globalAlpha = 0.6 + Math.sin(pose.time * 3) * 0.2 + pose.windup * 0.3;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.4);
  ctx.lineTo(-r * 0.1, 0);
  ctx.lineTo(-r * 0.4, r * 0.45);
  ctx.moveTo(-r * 0.1, 0);
  ctx.lineTo(r * 0.3, r * 0.1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = 8;
  ctx.fillRect(r * 0.4, -r * 0.3, r * 0.2, r * 0.18);
  ctx.fillRect(r * 0.4, r * 0.12, r * 0.2, r * 0.18);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Small horned imp with a flickering tail flame. */
export function drawImp(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose,
): void {
  ctx.save();
  ctx.rotate(facing);
  ctx.fillStyle = `rgba(255, 160, 60, ${0.5 + Math.sin(pose.time * 20) * 0.3})`;
  ctx.beginPath();
  ctx.arc(-r * 1.3, 0, r * 0.35 + Math.sin(pose.time * 25) * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(pose.flash, look.dark);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.2, side * r * 0.6);
    ctx.lineTo(-r * 0.1, side * r * 1.4);
    ctx.lineTo(-r * 0.3, side * r * 0.7);
    ctx.fill();
  }
  ctx.fillStyle = look.eyes;
  ctx.fillRect(r * 0.4, -r * 0.35, r * 0.25, r * 0.2);
  ctx.fillRect(r * 0.4, r * 0.15, r * 0.25, r * 0.2);
  ctx.restore();
}

/** Squat mortar creature with a barrel on its back that glows before firing. */
export function drawMortar(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose,
): void {
  ctx.save();
  ctx.rotate(facing);
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(pose.flash, look.dark);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Barrel.
  ctx.fillStyle = shade(pose.flash, '#2a2420');
  ctx.beginPath();
  ctx.arc(-r * 0.15, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 140, 50, ${0.3 + pose.windup * 0.7})`;
  ctx.beginPath();
  ctx.arc(-r * 0.15, 0, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.eyes;
  ctx.fillRect(r * 0.6, -r * 0.3, r * 0.2, r * 0.15);
  ctx.fillRect(r * 0.6, r * 0.15, r * 0.2, r * 0.15);
  ctx.restore();
}

/** Spiky crown + aura marking bosses. */
export function drawBossCrown(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  time: number,
  roaring: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = roaring ? 0.9 : 0.35 + Math.sin(time * 3) * 0.15;
  ctx.strokeStyle = color;
  ctx.lineWidth = roaring ? 4 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * (1.35 + (roaring ? Math.sin(time * 30) * 0.1 : 0)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = -r * 0.5 + (i * r) / 4;
    ctx.lineTo(x, -r - 4 - (i % 2 === 0 ? 8 : 3));
    ctx.lineTo(x + r / 8, -r - 4);
  }
  ctx.lineTo(r * 0.5, -r - 2);
  ctx.lineTo(-r * 0.5, -r - 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Invocateur: tattered robe, a lantern staff and soul motes swirling around. */
export function drawSummoner(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: BladeLook,
  opts: { flash: boolean; time: number; alpha: number; swing: SwingPose | null; souls: number },
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  const c = (col: string): string => (opts.flash ? '#ffffff' : col);
  // Soul motes orbit in world orientation (they don't turn with the body).
  for (let i = 0; i < 4; i++) {
    const a = opts.time * 1.8 + (i * Math.PI) / 2;
    const rr = r * (1.5 + Math.sin(opts.time * 3 + i) * 0.15);
    ctx.fillStyle = look.trim;
    ctx.globalAlpha = opts.alpha * (0.25 + Math.min(1, opts.souls / 4) * 0.55);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.7 - r * 0.2, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = opts.alpha;
  ctx.rotate(facing);
  // Ragged robe: a jagged hem trailing behind.
  ctx.fillStyle = c(look.body);
  ctx.beginPath();
  ctx.moveTo(r * 0.9, 0);
  ctx.quadraticCurveTo(r * 0.3, -r * 1.2, -r * 0.9, -r * 0.95);
  for (let i = 0; i <= 4; i++) {
    const k = i / 4;
    const jag = i % 2 === 0 ? -r * 1.35 : -r * 1.05;
    ctx.lineTo(jag + Math.sin(opts.time * 6 + i) * 1.5, -r * 0.95 + k * r * 1.9);
  }
  ctx.quadraticCurveTo(r * 0.3, r * 1.2, r * 0.9, 0);
  ctx.fill();
  ctx.strokeStyle = c(look.trim);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Deep hood with two pale eyes.
  ctx.fillStyle = c('#0c1512');
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.trim;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.2, r * 0.1, 0, Math.PI * 2);
  ctx.arc(r * 0.45, r * 0.2, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Lash hand: a ghostly chain cracks forward during the swing.
  if (opts.swing && opts.swing.phase !== 'recovery') {
    const ext = opts.swing.phase === 'active' ? 1 : opts.swing.t * 0.3;
    ctx.strokeStyle = look.trim;
    ctx.globalAlpha = opts.alpha * 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 0.6, -r * 0.6);
    const len = r * 1 + ext * r * 8;
    for (let k = 1; k <= 6; k++) {
      const x = r * 0.6 + (len * k) / 6;
      ctx.lineTo(x, -r * 0.6 + Math.sin(k * 1.7 + opts.time * 30) * 3 * ext);
    }
    ctx.stroke();
    ctx.globalAlpha = opts.alpha;
  }
  // Lantern staff in the other hand.
  ctx.save();
  ctx.translate(r * 0.25, r * 0.95);
  ctx.rotate(-0.25);
  ctx.strokeStyle = '#4b3a2a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(r * 1.15, 0);
  ctx.stroke();
  const flicker = 0.7 + Math.sin(opts.time * 13) * 0.15;
  ctx.fillStyle = look.trim;
  ctx.shadowColor = look.trim;
  ctx.shadowBlur = 10 * flicker;
  ctx.fillRect(r * 1.1, -r * 0.28, r * 0.5, r * 0.56);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = c('#2a2a2a');
  ctx.lineWidth = 1;
  ctx.strokeRect(r * 1.1, -r * 0.28, r * 0.5, r * 0.56);
  ctx.restore();
  ctx.restore();
}

/** Berserker: heavy frame, fur mantle, two axes; glows hotter with rage. */
export function drawBerserker(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: BladeLook,
  opts: {
    flash: boolean;
    time: number;
    alpha: number;
    swing: SwingPose | null;
    rage: number;
    spinning: boolean;
    frenzy: boolean;
  },
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  const c = (col: string): string => (opts.flash ? '#ffffff' : col);
  // Rage aura: grows and pulses with rage, flickers in frenzy.
  if (opts.rage > 0.15 || opts.frenzy) {
    const k = opts.frenzy ? 1 : opts.rage;
    ctx.globalAlpha =
      opts.alpha * (0.15 + k * 0.35) * (0.8 + Math.sin(opts.time * (opts.frenzy ? 22 : 8)) * 0.2);
    ctx.fillStyle = opts.frenzy ? '#ff2a1a' : look.trim;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.3 + k * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = opts.alpha;
  }
  const spinAngle = opts.spinning ? opts.time * 26 : 0;
  ctx.rotate(facing + spinAngle);
  const drawAxe = (side: number, angle: number): void => {
    ctx.save();
    ctx.translate(r * 0.25, side * r * 0.85);
    ctx.rotate(angle * side);
    ctx.strokeStyle = '#5b4030';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 1.25, 0);
    ctx.stroke();
    ctx.fillStyle = c('#c9ccd6');
    ctx.beginPath();
    ctx.moveTo(r * 1.0, 0);
    ctx.quadraticCurveTo(r * 1.25, -side * r * 0.75, r * 1.55, -side * r * 0.55);
    ctx.lineTo(r * 1.45, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  // Both axes swing: the lead one follows the combo pose.
  const lead = opts.swing && opts.swing.index % 2 === 1 ? -1 : 1;
  const sw = opts.swing ? swingAngle(opts.swing, 1.5, 1.4) : 0;
  const rest = opts.spinning ? 1.4 : 0.5;
  drawAxe(1, lead === 1 && opts.swing ? -sw : rest);
  drawAxe(-1, lead === -1 && opts.swing ? -sw : rest);
  // Body and fur mantle.
  ctx.fillStyle = c(look.body);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c(look.trim);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = c('#6b5442');
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.55 + (i / 6) * Math.PI * 0.9;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  // Helm with short horns.
  ctx.fillStyle = c('#3a3a42');
  ctx.beginPath();
  ctx.arc(r * 0.2, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c('#e8dcc0');
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.1, side * r * 0.45);
    ctx.quadraticCurveTo(-r * 0.2, side * r * 1.0, r * 0.25, side * r * 1.15);
    ctx.lineTo(r * 0.3, side * r * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = opts.rage > 0.6 || opts.frenzy ? '#ff3a1a' : look.eyes;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 4 + opts.rage * 8;
  ctx.fillRect(r * 0.48, -r * 0.25, r * 0.18, r * 0.12);
  ctx.fillRect(r * 0.48, r * 0.13, r * 0.18, r * 0.12);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Wisp: a teal flame with a flickering tail, brighter while rushing. */
export function drawWisp(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  opts: { flash: boolean; time: number; life: number; rush: boolean; windup: number; seed: number },
): void {
  ctx.save();
  // Fades out during its last second.
  ctx.globalAlpha = Math.min(1, opts.life * 6);
  const flick = Math.sin(opts.time * 18 + opts.seed) * 0.15;
  ctx.rotate(facing);
  ctx.fillStyle = opts.rush ? 'rgba(255, 240, 160, 0.35)' : 'rgba(92, 255, 196, 0.3)';
  ctx.beginPath();
  ctx.ellipse(-r * 1.2, 0, r * 2, r * (0.7 + flick), 0, 0, Math.PI * 2);
  ctx.fill();
  const grow = 1 + opts.windup * 0.4;
  ctx.fillStyle = opts.flash ? '#ffffff' : opts.rush ? '#fff0a0' : '#5cffc4';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, r * grow * (1 + flick * 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0c1512';
  ctx.fillRect(r * 0.15, -r * 0.4, r * 0.3, r * 0.22);
  ctx.fillRect(r * 0.15, r * 0.18, r * 0.3, r * 0.22);
  ctx.restore();
}

/** Bone colossus: a hulking ribcage with a skull, fists raised when slamming. */
export function drawColossus(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  opts: { flash: boolean; time: number; life: number; windup: number },
): void {
  ctx.save();
  ctx.globalAlpha = Math.min(1, opts.life * 4);
  const c = (col: string): string => (opts.flash ? '#ffffff' : col);
  ctx.fillStyle = 'rgba(92, 255, 196, 0.12)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5 + Math.sin(opts.time * 4) * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(facing);
  // Fists: pulled back up during the wind-up, then slammed.
  const lift = opts.windup;
  for (const side of [-1, 1]) {
    ctx.fillStyle = c('#d8d0bc');
    ctx.beginPath();
    ctx.arc(r * (0.7 - lift * 0.5), side * r * (1.0 + lift * 0.2), r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = c('#2a3a34');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c('#e8e0cc');
  ctx.lineWidth = 2.5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(-r * 0.1, i * r * 0.28, r * 0.7, -1.1, 1.1);
    ctx.stroke();
  }
  ctx.fillStyle = c('#efe8d4');
  ctx.beginPath();
  ctx.arc(r * 0.55, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5cffc4';
  ctx.shadowColor = '#5cffc4';
  ctx.shadowBlur = 8;
  ctx.fillRect(r * 0.62, -r * 0.2, r * 0.14, r * 0.12);
  ctx.fillRect(r * 0.62, r * 0.08, r * 0.14, r * 0.12);
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawThrownAxe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 22);
  ctx.strokeStyle = '#5b4030';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();
  ctx.fillStyle = '#d6d9e2';
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.quadraticCurveTo(7, -7, 10, -5);
  ctx.lineTo(9, 1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Spectre errant: a hooded, tattered ghost with long claws; flickers while blinking. */
export function drawWraith(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose & { fading: number },
): void {
  ctx.save();
  ctx.globalAlpha = 0.85 * (1 - pose.fading * 0.8) + Math.sin(pose.time * 13) * 0.05;
  ctx.rotate(facing);
  // Trailing rags.
  ctx.fillStyle = shade(pose.flash, look.dark);
  ctx.beginPath();
  ctx.moveTo(r * 0.6, -r * 0.8);
  for (let i = 0; i <= 5; i++) {
    const k = i / 5;
    const wave = Math.sin(pose.time * 8 + i * 1.3) * r * 0.25;
    ctx.lineTo(-r * (1.2 + (i % 2) * 0.5) + wave, -r * 0.8 + k * r * 1.6);
  }
  ctx.lineTo(r * 0.6, r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.arc(r * 0.1, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  // Claws reach forward during the windup.
  ctx.strokeStyle = shade(pose.flash, '#e8f0ff');
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      ctx.moveTo(r * 0.6, side * r * (0.5 + c * 0.12));
      ctx.lineTo(r * (1.1 + pose.windup * 0.6), side * r * (0.65 + c * 0.2));
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#0a0c14';
  ctx.beginPath();
  ctx.arc(r * 0.3, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = 8;
  ctx.fillRect(r * 0.45, -r * 0.25, r * 0.18, r * 0.12);
  ctx.fillRect(r * 0.45, r * 0.13, r * 0.18, r * 0.12);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Gelée / goutte de sève: a wobbling translucent blob with a shine. */
export function drawBlob(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose,
): void {
  ctx.save();
  const wob = Math.sin(pose.time * 6) * 0.08;
  const squash = 1 + pose.windup * 0.25;
  ctx.scale((1 + wob) * squash, (1 - wob) / squash);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(pose.flash, look.dark);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(-r * 0.2, r * 0.25, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.rotate(facing);
  ctx.fillStyle = look.eyes;
  ctx.fillRect(r * 0.35, -r * 0.3, r * 0.18, r * 0.18);
  ctx.fillRect(r * 0.35, r * 0.12, r * 0.18, r * 0.18);
  ctx.restore();
}

/** Fouisseur: digging claws and a pointed snout; underground it's just a moving mound. */
export function drawBurrower(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose & { underground: boolean },
): void {
  ctx.save();
  if (pose.underground) {
    ctx.fillStyle = '#3a2c1e';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.7, facing, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a4630';
    for (let i = 0; i < 5; i++) {
      const a = pose.time * 6 + i * 1.3;
      ctx.fillRect(Math.cos(a) * r * 0.8 - 1.5, Math.sin(a) * r * 0.5 - 1.5, 3, 3);
    }
    ctx.restore();
    return;
  }
  ctx.rotate(facing);
  ctx.fillStyle = shade(pose.flash, look.dark);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.4, side * r * 0.5);
    ctx.lineTo(r * 1.1, side * r * 0.9);
    ctx.lineTo(r * 0.6, side * r * 1.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(pose.flash, '#d9a0a0');
  ctx.beginPath();
  ctx.moveTo(r * 0.8, -r * 0.25);
  ctx.lineTo(r * 1.35, 0);
  ctx.lineTo(r * 0.8, r * 0.25);
  ctx.fill();
  ctx.fillStyle = look.eyes;
  ctx.fillRect(r * 0.45, -r * 0.4, r * 0.15, r * 0.12);
  ctx.fillRect(r * 0.45, r * 0.28, r * 0.15, r * 0.12);
  ctx.restore();
}

/** Porte-pavois: armoured body behind a tall tower shield held to the front. */
export function drawShieldBearer(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose & { guarding: boolean },
): void {
  ctx.save();
  ctx.rotate(facing);
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.beginPath();
  ctx.arc(-r * 0.15, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(pose.flash, look.dark);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Hammer raised during the windup.
  ctx.save();
  ctx.translate(-r * 0.2, r * 0.9);
  ctx.rotate(0.6 - pose.windup * 1.8 + (pose.active ? 1.6 : 0));
  ctx.fillStyle = '#5b4030';
  ctx.fillRect(0, -1.5, r * 1.3, 3);
  ctx.fillStyle = shade(pose.flash, '#9aa0aa');
  ctx.fillRect(r * 1.1, -r * 0.35, r * 0.45, r * 0.7);
  ctx.restore();
  // Tower shield in front (drops a little when stunned/striking).
  const lift = pose.guarding ? 0 : r * 0.25;
  ctx.fillStyle = shade(pose.flash, '#8a8f99');
  ctx.fillRect(r * 0.75 - lift, -r * 1.15, r * 0.4, r * 2.3);
  ctx.fillStyle = shade(pose.flash, look.eyes);
  ctx.fillRect(r * 0.82 - lift, -r * 0.2, r * 0.26, r * 0.4);
  ctx.strokeStyle = shade(pose.flash, '#4a4e57');
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r * 0.75 - lift, -r * 1.15, r * 0.4, r * 2.3);
  ctx.restore();
}

/** Mimique: a treasure chest with a lid that snaps open on rows of teeth. */
export function drawMimic(
  ctx: CanvasRenderingContext2D,
  r: number,
  facing: number,
  look: EnemyLook,
  pose: EnemyPose,
): void {
  ctx.save();
  ctx.rotate(facing + Math.PI / 2);
  const open = 0.25 + pose.windup * 0.6 + (pose.active ? 0.4 : 0) + Math.sin(pose.time * 8) * 0.05;
  const w = r * 1.7;
  const h = r * 1.2;
  ctx.fillStyle = shade(pose.flash, look.body);
  ctx.fillRect(-w / 2, -h * 0.1, w, h * 0.7);
  ctx.fillStyle = '#5a0c14';
  ctx.fillRect(-w / 2 + 2, -h * 0.1 - open * h * 0.5, w - 4, open * h * 0.5);
  ctx.fillStyle = '#f0e8d0';
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 3 + i * ((w - 6) / 6);
    ctx.beginPath();
    ctx.moveTo(x, -h * 0.1);
    ctx.lineTo(x + (w - 6) / 12, -h * 0.1 - 5);
    ctx.lineTo(x + (w - 6) / 6, -h * 0.1);
    ctx.fill();
  }
  ctx.fillStyle = shade(pose.flash, look.dark);
  ctx.fillRect(-w / 2, -h * 0.1 - open * h * 0.5 - h * 0.35, w, h * 0.35);
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(-3, -h * 0.1 - open * h * 0.5 - h * 0.2, 6, 6);
  ctx.fillStyle = look.eyes;
  ctx.shadowColor = look.eyes;
  ctx.shadowBlur = 6;
  ctx.fillRect(-w * 0.3, -h * 0.1 - open * h * 0.5 + 2, 4, 3);
  ctx.fillRect(w * 0.3 - 4, -h * 0.1 - open * h * 0.5 + 2, 4, 3);
  ctx.shadowBlur = 0;
  ctx.restore();
}
