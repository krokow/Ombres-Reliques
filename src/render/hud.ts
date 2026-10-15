import { damp } from '../core/math';
import { BIOMES, floorInBiome, FLOORS_PER_BIOME, loopOf, RUN_FLOORS } from '../data/biomes';
import { classDef, type ClassId } from '../data/classes';
import { KEY_BINDINGS } from '../data/controls';
import { STATUSES } from '../data/statuses';
import { TEAM } from '../data/team';
import { xpToNext } from '../data/progression';
import { CONSUMABLES, RELICS, type RelicDef } from '../data/items';
import type { Game } from '../game/game';
import { keyLabel } from '../input/keyLabels';
import { kitFor } from '../systems/kits';
import type { Effects } from './effects';
import { PALETTE } from './palette';

const FONT = 'ui-monospace, Menlo, monospace';

/** Screen-space HUD drawn on the canvas (cheap, crisp, no DOM churn). */
export class Hud {
  /** HP shown on the trailing "lag" bar, eases down after damage. */
  private lagHp = -1;
  private lagFor: ClassId | null = null;

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
    const party = w.req(e, 'party');
    const def = classDef(player.classId);

    if (this.lagFor !== player.classId || this.lagHp < health.hp) {
      this.lagHp = health.hp;
      this.lagFor = player.classId;
    }
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

    // --- Main bar: HP (+ shield), energy, mana.
    const barW = Math.min(320, width - 40);
    const x = (width - barW) / 2;
    const y = height - 46;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 6, y - 20, barW + 12, 46);
    ctx.fillStyle = PALETTE.hpBack;
    ctx.fillRect(x, y, barW, 12);
    ctx.fillStyle = PALETTE.hpLag;
    ctx.fillRect(x, y, (barW * this.lagHp) / health.max, 12);
    ctx.fillStyle = PALETTE.hp;
    ctx.fillRect(x, y, (barW * health.hp) / health.max, 12);
    if (health.shield > 0) {
      ctx.fillStyle = 'rgba(220, 235, 255, 0.75)';
      ctx.fillRect(x, y, Math.min(barW, (barW * health.shield) / health.max), 4);
    }
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.hudText;
    const shieldTxt = health.shield >= 1 ? ` +${Math.floor(health.shield)}` : '';
    ctx.fillText(`${Math.ceil(health.hp)} / ${health.max}${shieldTxt}`, width / 2, y + 6.5);
    ctx.fillStyle = '#10232a';
    ctx.fillRect(x, y + 15, barW, 4);
    ctx.fillStyle = PALETTE.energy;
    ctx.fillRect(x, y + 15, (barW * player.energy) / def.maxEnergy, 4);
    if (def.id === 'arcanist') {
      ctx.fillStyle = '#121a33';
      ctx.fillRect(x, y + 21, barW, 4);
      ctx.fillStyle = '#5a8cff';
      ctx.fillRect(x, y + 21, Math.min(barW, (barW * player.mana) / def.maxMana), 4);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = def.palette.trim;
    ctx.fillText(def.name.toUpperCase(), x, y - 11);
    (w.get(e, 'statuses')?.list ?? []).forEach((st, i) => {
      ctx.fillStyle = STATUSES[st.id].color;
      ctx.fillRect(x + 110 + i * 10, y - 15, 7, 7);
    });

    // --- Skill slots, provided by the active kit.
    const slots = kitFor(player.classId).hud(game);
    const slot = 34;
    const gap = 8;
    const sy = y - 22 - slot - 10;
    const sx0 = width / 2 - (slot * slots.length + gap * (slots.length - 1)) / 2;
    slots.forEach((sl, i) => {
      const sx = sx0 + i * (slot + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx, sy, slot, slot);
      const f = Math.max(0, Math.min(1, sl.fill));
      ctx.fillStyle = sl.ready ? sl.color : '#3a3550';
      ctx.globalAlpha = sl.ready ? 0.85 : 0.6;
      ctx.fillRect(sx, sy + slot * (1 - f), slot, slot * f);
      ctx.globalAlpha = 1;
      if (sl.ready && sl.key === 'ultimate') {
        ctx.strokeStyle = PALETTE.crit;
        ctx.lineWidth = 2 + Math.sin(performance.now() / 120);
        ctx.strokeRect(sx - 1, sy - 1, slot + 2, slot + 2);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, slot - 1, slot - 1);
      ctx.fillStyle = sl.ready ? '#0b0910' : PALETTE.hudText;
      ctx.textAlign = 'center';
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillText(keyLabel(KEY_BINDINGS[sl.key][0]), sx + slot / 2, sy + slot / 2 - 4);
      ctx.font = `8px ${FONT}`;
      ctx.fillText(sl.count ?? '', sx + slot / 2, sy + slot / 2 + 9);
      ctx.fillStyle = PALETTE.hudDim;
      ctx.fillText(sl.label, sx + slot / 2, sy + slot + 7);
    });

    // Quick consumables (F / G), right of the skill slots.
    const qx0 = sx0 + slots.length * (slot + gap) + 14;
    party.quick.forEach((q, i) => {
      const qx = qx0 + i * (slot + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(qx, sy, slot, slot);
      ctx.strokeStyle = 'rgba(255,211,77,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(qx + 0.5, sy + 0.5, slot - 1, slot - 1);
      ctx.textAlign = 'center';
      if (q) {
        ctx.fillStyle = CONSUMABLES[q.id].color;
        ctx.beginPath();
        ctx.arc(qx + slot / 2, sy + slot / 2 + 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.hudText;
        ctx.font = `bold 9px ${FONT}`;
        ctx.fillText(`×${q.count}`, qx + slot - 8, sy + slot - 6);
      }
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillText(keyLabel(KEY_BINDINGS[i === 0 ? 'quick1' : 'quick2'][0]), qx + 7, sy + 8);
      ctx.fillStyle = PALETTE.hudDim;
      ctx.font = `8px ${FONT}`;
      ctx.fillText(q ? CONSUMABLES[q.id].short : '—', qx + slot / 2, sy + slot + 7);
    });

    this.drawParty(ctx, height, game);

    // --- Floor / kills (or arena wave).
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = PALETTE.hudText;
    const loop = loopOf(game.level);
    const where = game.dungeon
      ? `${loop > 0 ? `Boucle ${loop + 1} · ` : ''}Étage ${game.level} · ${BIOMES[game.biome].name} ${floorInBiome(game.level)}/${FLOORS_PER_BIOME}`
      : `Vague ${game.waves.wave}`;
    ctx.fillText(`${where}   Éliminations ${party.kills}`, width - 14, 12);
    // Gold, keys and party relics (minimap sits below: keep this compact).
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(
      `${party.gold} or   ${party.keys} clé${party.keys > 1 ? 's' : ''}`,
      width - 14,
      game.dungeon ? 214 : 30,
    );
    party.relics.forEach((id, i) => {
      const r: RelicDef = RELICS[id];
      const rx = width - 20 - i * 16;
      const ry = game.dungeon ? 236 : 52;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 6);
      ctx.lineTo(rx + 6, ry);
      ctx.lineTo(rx, ry + 6);
      ctx.lineTo(rx - 6, ry);
      ctx.closePath();
      ctx.fill();
      if (r.curse) {
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    // --- Champion (mini-boss / boss) HP bar.
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
      ctx.font = `bold 11px ${FONT}`;
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
      ctx.font = `bold 34px ${FONT}`;
      ctx.fillStyle = PALETTE.hudText;
      ctx.fillText(fx.banner.text, width / 2, height * 0.28 - (1 - t) * 10);
      ctx.globalAlpha = 1;
    }

    if (game.dungeon?.victory && game.level === RUN_FLOORS && game.playerAlive) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(5,3,10,0.55)';
      ctx.fillRect(0, height * 0.62, width, 56);
      ctx.fillStyle = PALETTE.crit;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText('Victoire ! Les reliques sont vôtres.', width / 2, height * 0.62 + 18);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(
        'L’escalier mène au mode infini (les biomes reviennent, plus durs) · Entrée : nouvelle run',
        width / 2,
        height * 0.62 + 40,
      );
    }

    if (!game.playerAlive) {
      ctx.fillStyle = 'rgba(5,3,10,0.65)';
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.hp;
      ctx.font = `bold 40px ${FONT}`;
      ctx.fillText('L’équipe est tombée', width / 2, height / 2 - 30);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = `15px ${FONT}`;
      const reached = game.dungeon ? `Étage ${game.level}` : `Vague ${game.waves.wave}`;
      ctx.fillText(
        `${reached} · ${party.kills} éliminations · seed ${game.seed}`,
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

  /** Party portraits (1/2/3): HP, re-entry lockout, KO. */
  private drawParty(ctx: CanvasRenderingContext2D, height: number, game: Game): void {
    const party = game.world.req(game.player, 'party');
    const size = 40;
    party.members.forEach((m, i) => {
      const def = classDef(m.classId);
      const x = 14;
      const y = height - 60 - (party.members.length - 1 - i) * (size + 12);
      const active = i === party.active;
      ctx.fillStyle = active ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 3, y - 3, size + 96, size + 6);
      // Portrait: class colours.
      ctx.fillStyle = def.palette.body;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = active ? 3 : 1.5;
      ctx.strokeStyle = def.palette.trim;
      ctx.stroke();
      ctx.fillStyle = def.palette.eyes;
      ctx.fillRect(x + size / 2 + 2, y + size / 2 - 4, 4, 3);
      ctx.fillRect(x + size / 2 + 2, y + size / 2 + 2, 4, 3);
      // Lockout / global cooldown sweep.
      const lock = m.ko
        ? 1
        : !active
          ? Math.max(
              m.lockout / TEAM.reentryLockoutTicks,
              party.switchCooldown / TEAM.switchCooldownTicks,
            )
          : 0;
      if (lock > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.moveTo(x + size / 2, y + size / 2);
        ctx.arc(
          x + size / 2,
          y + size / 2,
          size / 2 - 2,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * lock,
        );
        ctx.fill();
      }
      if (m.ko) {
        ctx.strokeStyle = PALETTE.hp;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 8);
        ctx.lineTo(x + size - 8, y + size - 8);
        ctx.moveTo(x + size - 8, y + 8);
        ctx.lineTo(x + 8, y + size - 8);
        ctx.stroke();
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillStyle = active ? def.palette.trim : PALETTE.hudText;
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillText(`${i + 1} ${def.name}`, x + size + 6, y + 2);
      ctx.font = `9px ${FONT}`;
      ctx.fillStyle = PALETTE.hudDim;
      ctx.fillText(`Nv ${m.progress.level}`, x + size + 6, y + 13);
      // Something to spend: pulsing badge with the panel key.
      if (m.progress.pendingCards > 0 || m.progress.talentPoints > 0) {
        ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 150) * 0.4;
        ctx.fillStyle = PALETTE.crit;
        ctx.font = `bold 10px ${FONT}`;
        ctx.fillText(`▲ ${keyLabel(KEY_BINDINGS.progress[0])}`, x + size + 50, y + 13);
        ctx.globalAlpha = 1;
      }
      const bw = 82;
      ctx.fillStyle = PALETTE.hpBack;
      ctx.fillRect(x + size + 6, y + 24, bw, 5);
      ctx.fillStyle = m.ko ? '#555' : PALETTE.hp;
      ctx.fillRect(x + size + 6, y + 24, (bw * m.health.hp) / m.health.max, 5);
      ctx.fillStyle = PALETTE.energy;
      ctx.fillRect(x + size + 6, y + 31, (bw * m.state.energy) / def.maxEnergy, 2);
      ctx.fillStyle = '#9b7bff';
      ctx.fillRect(x + size + 6, y + 35, (bw * m.progress.xp) / xpToNext(m.progress.level), 2);
    });
  }
}
