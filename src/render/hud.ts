import { damp } from '../core/math';
import { CLASSES } from '../data/classes';
import type { Game } from '../game/game';
import type { Effects } from './effects';
import { PALETTE } from './palette';

/** Screen-space HUD drawn on the canvas (cheap, crisp, no DOM churn). */
export class Hud {
  /** HP shown on the trailing "lag" bar, eases down after damage. */
  private lagHp = -1;

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    game: Game,
    fx: Effects,
    dt: number,
  ): void {
    const w = game.world;
    const e = game.player;
    const health = w.req(e, 'health');
    const player = w.req(e, 'player');
    const dash = w.req(e, 'dash');
    const def = CLASSES[player.classId];

    if (this.lagHp < 0 || this.lagHp < health.hp) this.lagHp = health.hp;
    this.lagHp += (health.hp - this.lagHp) * damp(4, dt);

    // Hurt / low-HP vignette.
    const low = 1 - health.hp / health.max;
    const vignette = Math.max(fx.hurtFlash * 1.6, low > 0.65 ? (low - 0.65) * 1.2 : 0);
    if (vignette > 0) {
      const g = ctx.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.3,
        width / 2,
        height / 2,
        height * 0.8,
      );
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${Math.min(0.55, vignette)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    const barW = Math.min(320, width - 40);
    const x = (width - barW) / 2;
    const y = height - 46;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 6, y - 22, barW + 12, 46);

    // HP.
    ctx.fillStyle = PALETTE.hpBack;
    ctx.fillRect(x, y, barW, 12);
    ctx.fillStyle = PALETTE.hpLag;
    ctx.fillRect(x, y, (barW * this.lagHp) / health.max, 12);
    ctx.fillStyle = PALETTE.hp;
    ctx.fillRect(x, y, (barW * health.hp) / health.max, 12);
    ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.hudText;
    ctx.fillText(`${Math.ceil(health.hp)} / ${health.max}`, width / 2, y + 6.5);

    // Energy.
    ctx.fillStyle = '#10232a';
    ctx.fillRect(x, y + 15, barW, 4);
    ctx.fillStyle = PALETTE.energy;
    ctx.fillRect(x, y + 15, (barW * player.energy) / def.maxEnergy, 4);

    // Dash charges (diamonds) + recharge progress on the next one.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(def.name.toUpperCase(), x, y - 12);
    for (let i = 0; i < def.dash.maxCharges; i++) {
      const cx = x + barW - 8 - i * 16;
      const cy = y - 12;
      const filled = def.dash.maxCharges - 1 - i < dash.charges;
      const recharging = def.dash.maxCharges - 1 - i === dash.charges;
      this.diamond(ctx, cx, cy, 5, '#2a2f3d');
      if (filled) this.diamond(ctx, cx, cy, 5, PALETTE.energy);
      else if (recharging)
        this.diamond(ctx, cx, cy, 5 * (dash.recharge / def.dash.rechargeTicks), '#3f7f8a');
    }
    // Shuriken cooldown.
    const sx = x + barW - 8 - def.dash.maxCharges * 16 - 6;
    const ready = player.rangedCooldown <= 0;
    ctx.strokeStyle = ready ? PALETTE.shuriken : '#3a3f55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      sx,
      y - 12,
      5,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (1 - player.rangedCooldown / def.ranged.cooldownTicks),
    );
    ctx.stroke();

    // Wave / kills.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.fillStyle = PALETTE.hudText;
    ctx.fillText(`Vague ${game.waves.wave}   Éliminations ${player.kills}`, width - 14, 12);

    if (fx.banner) {
      const t = fx.banner.life / fx.banner.maxLife;
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 34px ui-monospace, Menlo, monospace';
      ctx.fillStyle = PALETTE.hudText;
      ctx.fillText(fx.banner.text, width / 2, height * 0.28 - (1 - t) * 10);
      ctx.globalAlpha = 1;
    }

    if (health.hp <= 0) {
      ctx.fillStyle = 'rgba(5,3,10,0.65)';
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.hp;
      ctx.font = 'bold 40px ui-monospace, Menlo, monospace';
      ctx.fillText('Tombée dans l’ombre', width / 2, height / 2 - 30);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '15px ui-monospace, Menlo, monospace';
      ctx.fillText(
        `Vague ${game.waves.wave} · ${player.kills} éliminations · seed ${game.seed}`,
        width / 2,
        height / 2 + 12,
      );
      ctx.fillStyle = PALETTE.hudDim;
      ctx.fillText(
        'Entrée : nouvelle run   ·   Retour arrière : même seed',
        width / 2,
        height / 2 + 40,
      );
    }
  }

  private diamond(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }
}
