import { damp } from '../core/math';
import { BIOMES } from '../data/biomes';
import { CLASSES } from '../data/classes';
import { KEY_BINDINGS } from '../data/controls';
import { STATUSES } from '../data/statuses';
import { keyLabel } from '../input/keyLabels';
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
    ctx.fillRect(x - 6, y - 20, barW + 12, 44);

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

    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(def.name.toUpperCase(), x, y - 12);

    // Player statuses next to the class name.
    const statuses = w.get(e, 'statuses')?.list ?? [];
    statuses.forEach((st, i) => {
      ctx.fillStyle = STATUSES[st.id].color;
      ctx.fillRect(x + 100 + i * 10, y - 16, 7, 7);
    });

    // Skill slots: dash charges, shuriken, veil, ultimate.
    const slot = 34;
    const gap = 8;
    const sy = y - 22 - slot - 8;
    const sx0 = width / 2 - (slot * 4 + gap * 3) / 2;
    const slots: {
      key: string;
      fill: number;
      ready: boolean;
      label: string;
      color: string;
      count?: string;
    }[] = [
      {
        key: keyLabel(KEY_BINDINGS.dash[0]),
        fill: dash.charges >= def.dash.maxCharges ? 1 : dash.recharge / def.dash.rechargeTicks,
        ready: dash.charges > 0,
        label: 'Dash',
        color: PALETTE.energy,
        count: `${dash.charges}`,
      },
      {
        key: keyLabel(KEY_BINDINGS.ranged[0]),
        fill: 1 - player.rangedCooldown / def.ranged.cooldownTicks,
        ready: player.rangedCooldown <= 0,
        label: 'Shuriken',
        color: PALETTE.shuriken,
      },
      {
        key: keyLabel(KEY_BINDINGS.skill[0]),
        fill: 1 - player.skillCooldown / def.veil.cooldownTicks,
        ready: player.skillCooldown <= 0,
        label: 'Voile',
        color: '#8f86b8',
      },
      {
        key: keyLabel(KEY_BINDINGS.ultimate[0]),
        fill: player.energy / def.ultimate.energyCost,
        ready: player.energy >= def.ultimate.energyCost,
        label: 'Exécution',
        color: PALETTE.crit,
      },
    ];
    slots.forEach((sl, i) => {
      const sx = sx0 + i * (slot + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx, sy, slot, slot);
      const f = Math.max(0, Math.min(1, sl.fill));
      ctx.fillStyle = sl.ready ? sl.color : '#3a3550';
      ctx.globalAlpha = sl.ready ? 0.85 : 0.6;
      ctx.fillRect(sx, sy + slot * (1 - f), slot, slot * f);
      ctx.globalAlpha = 1;
      if (sl.ready && i === 3) {
        // Ultimate ready: pulsing frame.
        ctx.strokeStyle = PALETTE.crit;
        ctx.lineWidth = 2 + Math.sin(performance.now() / 120) * 1;
        ctx.strokeRect(sx - 1, sy - 1, slot + 2, slot + 2);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, slot - 1, slot - 1);
      ctx.fillStyle = sl.ready ? '#0b0910' : PALETTE.hudText;
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
      ctx.fillText(sl.key, sx + slot / 2, sy + slot / 2 - 4);
      ctx.font = '8px ui-monospace, Menlo, monospace';
      ctx.fillText(sl.count ?? '', sx + slot / 2, sy + slot / 2 + 9);
      ctx.fillStyle = PALETTE.hudDim;
      ctx.fillText(sl.label, sx + slot / 2, sy + slot + 7);
    });

    // Floor / kills (or arena wave).
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.fillStyle = PALETTE.hudText;
    const where = game.dungeon
      ? `Étage ${game.level} · ${BIOMES[game.biome].name}`
      : `Vague ${game.waves.wave}`;
    ctx.fillText(`${where}   Éliminations ${player.kills}`, width - 14, 12);

    // Champion (mini-boss / boss) HP bar.
    const champ = w.query('champion', 'health')[0];
    if (champ) {
      const [, c, ch] = champ;
      const bw = Math.min(420, width - 80);
      const bx = (width - bw) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 4, 30, bw + 8, 26);
      ctx.fillStyle = PALETTE.hpBack;
      ctx.fillRect(bx, 44, bw, 8);
      ctx.fillStyle = PALETTE.crit;
      ctx.fillRect(bx, 44, (bw * ch.hp) / ch.max, 8);
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
      ctx.fillStyle = PALETTE.hudText;
      ctx.fillText(c.name, width / 2, 32);
    }

    if (fx.ultFlash > 0) {
      ctx.fillStyle = `rgba(10, 0, 20, ${fx.ultFlash})`;
      ctx.fillRect(0, 0, width, height);
    }

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
        `${game.dungeon ? `Étage ${game.level}` : `Vague ${game.waves.wave}`} · ${player.kills} éliminations · seed ${game.seed}`,
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
}
