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
  // Reverse-grip dagger.
  ctx.strokeStyle = '#d9dcf2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r * 0.3, r * 0.85);
  ctx.lineTo(r * 1.15, r * 1.05);
  ctx.stroke();
  ctx.restore();
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
