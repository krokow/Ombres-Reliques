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
  opts: { flash: boolean; time: number; moveX: number; moveY: number; alpha: number },
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha;
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
