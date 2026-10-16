import { lerp } from '../core/math';
import { Tile, type TileMap } from '../core/tilemap';
import { hashString } from '../core/rng';
import { BIOMES, type BiomeDef } from '../data/biomes';
import { LIGHTS } from '../data/config';
import { ARCANIST, BERSERKER, CLASSES, GUARDIAN, SHADOW_BLADE, SUMMONER } from '../data/classes';
import { ELITE_MODIFIERS } from '../data/elites';
import { enemyDef, type BossPattern } from '../data/enemies';
import { STATUSES } from '../data/statuses';
import { CONSUMABLES, RARITIES, RELICS } from '../data/items';
import { KEY_BINDINGS } from '../data/controls';
import { keyLabel } from '../input/keyLabels';
import { nearestInspectable, nearestInteractable } from '../systems/loot';
import type { RenderKind } from '../ecs/components';
import type { Entity } from '../ecs/world';
import type { Game } from '../game/game';
import { hasStatus } from '../systems/statuses';
import type { Camera } from './camera';
import type { Effects } from './effects';
import { PALETTE } from './palette';
import { applyAnim, type Animator } from './anim';
import { drawWalls3D, Lighting, type LightSource } from './depth';
import {
  drawBeast,
  drawBossCrown,
  drawGolem,
  drawImp,
  drawKnight,
  drawMortar,
  drawArcaneBolt,
  drawArcanist,
  drawFire,
  drawFrostOrb,
  drawGuardian,
  swingPose,
  drawArcher,
  drawBloater,
  drawBoneArrow,
  drawCryptomancer,
  drawGhoul,
  drawShadow,
  drawShadowBlade,
  drawShuriken,
  drawSmoke,
  drawSummoner,
  drawBerserker,
  drawWisp,
  drawColossus,
  drawThrownAxe,
  drawWraith,
  drawBlob,
  drawBurrower,
  drawShieldBearer,
  drawMimic,
} from './sprites';

export interface RenderOptions {
  showHitboxes: boolean;
  /** Dynamic lighting layer (can be turned off in the options). */
  lighting: boolean;
}

type BiomePalette = BiomeDef['palette'];

interface Drawable {
  y: number;
  draw(): void;
}

interface Interp {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

function interp(t: Interp, alpha: number): { x: number; y: number } {
  return { x: lerp(t.prevX, t.x, alpha), y: lerp(t.prevY, t.y, alpha) };
}

/** Canvas 2D renderer. Reads the world, never mutates it. */
/** Telegraph progress (0..1) and "attacking now" flag for any enemy, whatever its behaviour. */
export function enemyTelegraph(game: Game, e: Entity): { windup: number; active: boolean } {
  const w = game.world;
  const ai = w.req(e, 'enemy');
  const def = enemyDef(ai.defId);
  const k = (total: number): number => Math.min(1, ai.phaseTicks / Math.max(1, total));
  switch (def.behavior) {
    case 'melee':
      return {
        windup: ai.phase === 'windup' ? k(def.windupTicks) : 0,
        active: ai.phase === 'strike',
      };
    case 'ranged':
    case 'artillery':
      return { windup: ai.phase === 'windup' ? k(def.windupTicks) : 0, active: false };
    case 'kamikaze':
      return { windup: ai.phase === 'fuse' ? k(def.fuseTicks) : 0, active: false };
    case 'summoner':
      return { windup: ai.phase === 'channel' ? k(def.channelTicks) : 0, active: false };
    case 'charger':
      return {
        windup: ai.phase === 'windup' ? k(def.windupTicks) : 0,
        active: ai.phase === 'strike',
      };
    case 'blinker':
      return {
        windup: ai.phase === 'windup' ? k(def.windupTicks) : ai.phase === 'channel' ? 0.3 : 0,
        active: ai.phase === 'recover' && ai.phaseTicks < 6,
      };
    case 'healer':
      return { windup: ai.phase === 'channel' ? k(def.channelTicks) : 0, active: false };
    case 'burrower':
      return { windup: ai.phase === 'windup' ? k(def.emergeTicks) : 0, active: false };
    case 'boss': {
      const st = w.get(e, 'boss');
      const pat = st
        ? def.phases[st.phase]?.patterns[st.current % (def.phases[st.phase]?.patterns.length ?? 1)]
        : undefined;
      return {
        windup: st?.step === 'windup' && pat ? Math.min(1, st.ticks / pat.windupTicks) : 0,
        active: st?.step === 'active',
      };
    }
  }
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;
  private mapCache: { map: TileMap; palette: BiomePalette; canvas: HTMLCanvasElement } | null =
    null;
  private time = 0;
  private readonly lighting = new Lighting();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
  }

  /** Matches the backing store to CSS size × devicePixelRatio for crisp output. */
  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  /** Resets to screen space (CSS pixels), for HUD drawing. */
  screenSpace(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(
    game: Game,
    camera: Camera,
    fx: Effects,
    anim: Animator,
    alpha: number,
    frameDt: number,
    opts: RenderOptions,
  ): void {
    const ctx = this.ctx;
    const w = game.world;
    this.time += frameDt;
    this.screenSpace();
    const pal = BIOMES[game.biome].palette;
    ctx.fillStyle = pal.background;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.rotate(camera.shakeAngle);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x + camera.shakeX, -camera.y + camera.shakeY);

    ctx.drawImage(this.mapCanvas(game.map, pal), 0, 0);
    this.drawDynamicTiles(game, pal);
    const view = {
      cx: camera.x,
      cy: camera.y,
      halfW: this.width / 2 / camera.zoom + 48,
      halfH: this.height / 2 / camera.zoom + 48,
    };
    const torches = drawWalls3D(
      ctx,
      game.map,
      pal,
      view,
      game.dungeon?.floor.explored ?? null,
      this.time,
    );
    this.drawLoot(game, alpha);
    for (const [, z, t] of w.query('zone', 'transform')) {
      if (z.kind === 'fire') drawFire(ctx, t.x, t.y, z.radius, z.ticks / z.maxTicks, this.time);
    }
    this.drawTelegraphs(game, alpha);
    fx.drawCorpses(ctx);

    for (const g of fx.ghosts) {
      const def = CLASSES.shadowBlade;
      ctx.globalAlpha = (g.life / g.maxLife) * 0.45;
      ctx.fillStyle = def.palette.trim;
      ctx.beginPath();
      ctx.arc(g.x, g.y, def.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const drawables: Drawable[] = [];
    for (const [e, t, r, body] of w.query('transform', 'renderable', 'body')) {
      const p = interp(t, alpha);
      drawables.push({
        y: p.y,
        draw: () => this.drawActor(game, e, r.kind, p.x, p.y, body.radius, fx, anim),
      });
    }
    for (const [e, , t] of w.query('projectile', 'transform')) {
      const p = interp(t, alpha);
      const kind = w.get(e, 'renderable')?.kind;
      const v = w.get(e, 'velocity');
      drawables.push({
        y: p.y,
        draw: () => {
          const angle = Math.atan2(v?.y ?? 0, v?.x ?? 1);
          if (kind === 'boneArrow') drawBoneArrow(ctx, p.x, p.y, angle);
          else if (kind === 'arcaneBolt') {
            const hb = w.get(e, 'hitbox');
            drawArcaneBolt(
              ctx,
              p.x,
              p.y,
              angle,
              (hb?.shape.kind === 'circle' ? hb.shape.radius : 0) > 6,
              this.time,
            );
          } else if (kind === 'frostOrb') drawFrostOrb(ctx, p.x, p.y, this.time);
          else if (kind === 'axe') drawThrownAxe(ctx, p.x, p.y, this.time);
          else drawShuriken(ctx, p.x, p.y, 4, this.time);
        },
      });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // Smoke is drawn over actors so it actually hides them.
    for (const [, z, t] of w.query('zone', 'transform')) {
      if (z.kind === 'smoke') drawSmoke(ctx, t.x, t.y, z.radius, z.ticks / z.maxTicks, this.time);
    }

    this.drawSlashes(game, fx, alpha);
    fx.drawParticles(ctx);
    this.drawAmbient(game, camera);
    if (opts.lighting) {
      const darkness = game.dungeon ? BIOMES[game.biome].light.darkness : LIGHTS.arenaDarkness;
      this.lighting.draw(
        ctx,
        this.width,
        this.height,
        this.dpr,
        (c) => this.worldTransform(c, camera),
        darkness,
        this.collectLights(game, fx, alpha, torches),
      );
    }
    this.drawFog(game, camera, pal);
    this.drawEnemyBars(game, alpha);
    if (opts.showHitboxes) this.drawHitboxes(game);
    this.drawPrompt(game);
    fx.drawTexts(ctx);
    ctx.restore();
  }

  private drawActor(
    game: Game,
    e: Entity,
    kind: RenderKind,
    x: number,
    y: number,
    radius: number,
    fx: Effects,
    anim: Animator,
  ): void {
    const ctx = this.ctx;
    const w = game.world;
    const flash = fx.flashes.has(e);
    const facing = w.get(e, 'facing')?.angle ?? 0;
    drawShadow(ctx, x, y, radius);

    const elite = w.get(e, 'elite');
    if (elite) {
      elite.mods.forEach((m, i) => {
        ctx.strokeStyle = ELITE_MODIFIERS[m].color;
        ctx.globalAlpha = 0.55 + Math.sin(this.time * 5 + i) * 0.25;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius + 5 + i * 3, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    ctx.save();
    applyAnim(ctx, x, y, anim.get(e), this.time);

    if (e === game.player) {
      this.drawPlayer(game, kind, radius, facing, flash);
      ctx.restore();
      return;
    }

    const ally = w.get(e, 'ally');
    if (ally) {
      const def = ally.kind === 'wisp' ? SUMMONER.wisp : SUMMONER.colossus;
      const life = ally.life / 60;
      const windup = ally.windup >= 0 ? ally.windup / def.windupTicks : 0;
      if (ally.kind === 'wisp')
        drawWisp(ctx, radius, facing, {
          flash,
          time: this.time,
          life,
          rush: ally.rush > 0,
          windup,
          seed: e,
        });
      else drawColossus(ctx, radius, facing, { flash, time: this.time, life, windup });
      ctx.restore();
      return;
    }

    const ai = w.get(e, 'enemy');
    if (ai) {
      const def = enemyDef(ai.defId);
      const { windup, active } = enemyTelegraph(game, e);
      const staggered = w.req(e, 'health').stagger > 0 || hasStatus(w, e, 'stun');
      const pose = { flash, time: this.time, windup, active };
      switch (def.look) {
        case 'ghoul':
          drawGhoul(ctx, 0, 0, radius, facing, def.palette, {
            flash,
            time: this.time,
            windup,
            striking: active,
            staggered,
          });
          break;
        case 'archer':
          drawArcher(ctx, 0, 0, radius, facing, def.palette, { flash, draw: windup });
          break;
        case 'bloater':
          drawBloater(ctx, 0, 0, radius, def.palette, { flash, time: this.time, fuse: windup });
          break;
        case 'caster':
          drawCryptomancer(ctx, 0, 0, radius, facing, def.palette, {
            flash,
            time: this.time,
            channel: windup,
          });
          break;
        case 'knight':
          drawKnight(ctx, radius, facing, def.palette, pose);
          break;
        case 'beast':
          drawBeast(ctx, radius, facing, def.palette, pose);
          break;
        case 'golem':
          drawGolem(ctx, radius, facing, def.palette, pose);
          break;
        case 'imp':
          drawImp(ctx, radius, facing, def.palette, pose);
          break;
        case 'mortar':
          drawMortar(ctx, radius, facing, def.palette, pose);
          break;
        case 'wraith':
          drawWraith(ctx, radius, facing, def.palette, {
            ...pose,
            fading: ai.phase === 'channel' ? Math.min(1, ai.phaseTicks / 20) : 0,
          });
          break;
        case 'blob':
          drawBlob(ctx, radius, facing, def.palette, pose);
          break;
        case 'burrower':
          drawBurrower(ctx, radius, facing, def.palette, {
            ...pose,
            underground: ai.phase === 'channel' || ai.phase === 'windup',
          });
          break;
        case 'shield':
          drawShieldBearer(ctx, radius, facing, def.palette, {
            ...pose,
            guarding: !staggered && ai.phase !== 'strike',
          });
          break;
        case 'mimic':
          drawMimic(ctx, radius, facing, def.palette, pose);
          break;
      }
      const boss = w.get(e, 'boss');
      if (boss) drawBossCrown(ctx, radius, def.palette.eyes, this.time, boss.step === 'transition');
      if (hasStatus(w, e, 'stun')) this.drawStunStars(radius);
    }
    ctx.restore();
  }

  /** Same world transform as the main pass, for the lighting layer. */
  private worldTransform(c: CanvasRenderingContext2D, camera: Camera): void {
    c.translate(this.width / 2, this.height / 2);
    c.rotate(camera.shakeAngle);
    c.scale(camera.zoom, camera.zoom);
    c.translate(-camera.x + camera.shakeX, -camera.y + camera.shakeY);
  }

  /** Everything that shines this frame. */
  private collectLights(
    game: Game,
    fx: Effects,
    alpha: number,
    torches: LightSource[],
  ): LightSource[] {
    const w = game.world;
    const tint = BIOMES[game.biome].light.torch;
    const out: LightSource[] = [];
    const pt = interp(w.req(game.player, 'transform'), alpha);
    out.push({ x: pt.x, y: pt.y, ...LIGHTS.player, glow: null });
    for (const t of torches) {
      const flicker = 0.9 + Math.sin(this.time * 9 + t.x * 0.1) * 0.06;
      out.push({
        x: t.x,
        y: t.y,
        radius: LIGHTS.torch.radius * flicker,
        intensity: LIGHTS.torch.intensity,
        glow: tint,
      });
    }
    for (const [, a, t] of w.query('ally', 'transform')) {
      const p = interp(t, alpha);
      const big = a.kind === 'colossus';
      out.push({
        x: p.x,
        y: p.y,
        radius: LIGHTS.wisp.radius * (big ? 1.6 : 1),
        intensity: LIGHTS.wisp.intensity,
        glow: '92, 255, 196',
      });
    }
    for (const [e, , t] of w.query('projectile', 'transform')) {
      const kind = w.get(e, 'renderable')?.kind;
      if (kind !== 'arcaneBolt' && kind !== 'frostOrb') continue;
      const p = interp(t, alpha);
      out.push({
        x: p.x,
        y: p.y,
        ...LIGHTS.bolt,
        glow: kind === 'frostOrb' ? '170, 230, 255' : '120, 200, 255',
      });
    }
    for (const [, z, t] of w.query('zone', 'transform')) {
      if (z.kind !== 'fire') continue;
      out.push({
        x: t.x,
        y: t.y,
        radius: z.radius * LIGHTS.fire.radiusMult,
        intensity: LIGHTS.fire.intensity * Math.min(1, (z.ticks / z.maxTicks) * 3),
        glow: '255, 140, 60',
      });
    }
    for (const r of fx.rings) {
      const k = r.life / r.maxLife;
      if (k <= 0) continue;
      out.push({
        x: r.x,
        y: r.y,
        radius: r.radius * LIGHTS.explosionRadiusMult,
        intensity: k,
        glow: null,
      });
    }
    const st = game.dungeon?.stairs;
    if (st) {
      const c = game.map.tileCenter(st.tx, st.ty);
      out.push({ x: c.x, y: c.y, ...LIGHTS.stairs, glow: '155, 123, 255' });
    }
    for (const [, it, t] of w.query('interactable', 'transform')) {
      if (it.kind === 'chest' && it.opened) continue;
      out.push({ x: t.x, y: t.y, ...LIGHTS.loot, glow: null });
    }
    for (const [, pk, t] of w.query('pickup', 'transform')) {
      if (pk.kind !== 'item' && pk.kind !== 'relic') continue;
      out.push({ x: t.x, y: t.y, ...LIGHTS.loot, glow: null });
    }
    return out;
  }

  /**
   * Biome motes (dust, spores, embers) on a screen-sized tile that wraps with
   * the camera: positions are a pure function of index and time.
   */
  private drawAmbient(game: Game, camera: Camera): void {
    const a = BIOMES[game.biome].ambient;
    const ctx = this.ctx;
    const w = this.width / camera.zoom + 80;
    const h = this.height / camera.zoom + 80;
    const left = camera.x - w / 2;
    const top = camera.y - h / 2;
    ctx.fillStyle = a.color;
    if (a.glow) {
      ctx.shadowColor = a.color;
      ctx.shadowBlur = 6;
    }
    for (let i = 0; i < a.count; i++) {
      const hx = ((i * 2654435761) >>> 0) / 4294967296;
      const hy = ((i * 1597334677 + 12345) >>> 0) / 4294967296;
      const phase = hx * 6.28;
      const px = hx * w + Math.sin(this.time * 0.4 + phase) * a.drift;
      const py = hy * h - this.time * a.rise;
      const x = left + ((((px - left) % w) + w) % w);
      const y = top + ((((py - top) % h) + h) % h);
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 1.3 + phase * 3));
      ctx.fillRect(x, y, a.size, a.size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  private drawStunStars(radius: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffe14d';
    for (let i = 0; i < 3; i++) {
      const a = this.time * 5 + (i * Math.PI * 2) / 3;
      ctx.fillRect(Math.cos(a) * radius * 0.9 - 1.5, -radius - 6 + Math.sin(a) * 3 - 1.5, 3, 3);
    }
  }

  /** The active party member, posed from its live simulation state. */
  private drawPlayer(
    game: Game,
    kind: RenderKind,
    radius: number,
    facing: number,
    flash: boolean,
  ): void {
    const ctx = this.ctx;
    const w = game.world;
    const e = game.player;
    const health = w.req(e, 'health');
    const state = w.req(e, 'player');
    const v = w.req(e, 'velocity');
    const dead = health.hp <= 0;
    // Blink during post-hurt i-frames (not during dash/ultimate i-frames).
    const blinking =
      health.invuln > 2 &&
      w.req(e, 'dash').active === 0 &&
      state.execution === null &&
      Math.floor(this.time * 20) % 2 === 0;
    const alpha = dead ? 0.25 : blinking ? 0.4 : 1;
    if (hasStatus(w, e, 'ambush')) {
      ctx.strokeStyle = STATUSES.ambush.color;
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 12) * 0.3;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const swing = swingPose(game);
    if (kind === 'shadowBlade') {
      drawShadowBlade(ctx, 0, 0, radius, facing, SHADOW_BLADE.palette, {
        flash,
        time: this.time,
        moveX: v.x,
        moveY: v.y,
        alpha,
        invisible: hasStatus(w, e, 'invisible'),
        swing,
      });
    } else if (kind === 'guardian') {
      drawGuardian(ctx, radius, facing, GUARDIAN.palette, {
        flash,
        time: this.time,
        alpha: hasStatus(w, e, 'invisible') ? alpha * 0.35 : alpha,
        blocking: state.blockTicks >= 0,
        swing,
        shield: health.shield,
      });
    } else if (kind === 'arcanist') {
      drawArcanist(ctx, radius, facing, ARCANIST.palette, {
        flash,
        time: this.time,
        alpha: hasStatus(w, e, 'invisible') ? alpha * 0.35 : alpha,
        cast: state.primaryCooldown / ARCANIST.bolt.cooldownTicks,
        channel: state.meteors !== null,
        mana: state.mana / ARCANIST.maxMana,
      });
    } else if (kind === 'summoner') {
      drawSummoner(ctx, radius, facing, SUMMONER.palette, {
        flash,
        time: this.time,
        alpha: hasStatus(w, e, 'invisible') ? alpha * 0.35 : alpha,
        swing,
        souls: w.query('ally').length,
      });
    } else if (kind === 'berserker') {
      drawBerserker(ctx, radius, facing, BERSERKER.palette, {
        flash,
        time: this.time,
        alpha: hasStatus(w, e, 'invisible') ? alpha * 0.35 : alpha,
        swing,
        rage: state.rage / BERSERKER.rage.max,
        spinning: state.spin > 0,
        frenzy: state.frenzy > 0,
      });
    }
  }

  /** Ground markings announcing every incoming attack: readability first. */
  private drawTelegraphs(game: Game, alpha: number): void {
    const ctx = this.ctx;
    const w = game.world;
    for (const [e, ai, t, facing, body] of w.query('enemy', 'transform', 'facing', 'body')) {
      const def = enemyDef(ai.defId);
      const p = interp(t, alpha);
      if (def.behavior === 'melee' && ai.phase === 'windup') {
        const progress = Math.min(1, ai.phaseTicks / def.windupTicks);
        const cx = p.x + Math.cos(facing.angle) * def.strike.reach;
        const cy = p.y + Math.sin(facing.angle) * def.strike.reach;
        this.telegraphCircle(cx, cy, def.strike.radius, progress);
      } else if (def.behavior === 'ranged' && ai.phase === 'windup') {
        const locked = ai.phaseTicks >= def.windupTicks - def.aimLockTicks;
        const a = Math.atan2(ai.aimY - p.y, ai.aimX - p.x);
        const len = def.projectile.speed * (def.projectile.lifetimeTicks / 60);
        ctx.strokeStyle = locked ? PALETTE.telegraphEdge : PALETTE.telegraph;
        ctx.lineWidth = locked ? 2 : 1;
        ctx.setLineDash(locked ? [] : [6, 6]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (def.behavior === 'kamikaze' && ai.phase === 'fuse') {
        this.telegraphCircle(
          p.x,
          p.y,
          def.explosion.radius,
          Math.min(1, ai.phaseTicks / def.fuseTicks),
        );
      } else if (def.behavior === 'charger' && ai.phase === 'windup') {
        const locked = ai.phaseTicks >= def.windupTicks - def.aimLockTicks;
        const len = def.charge.speed * (def.charge.durationTicks / 60);
        this.telegraphLane(
          p.x,
          p.y,
          Math.atan2(ai.aimY - p.y, ai.aimX - p.x),
          len,
          def.charge.radius,
          Math.min(1, ai.phaseTicks / def.windupTicks),
          locked,
        );
      } else if (def.behavior === 'artillery' && ai.phase === 'windup') {
        this.crosshair(
          ai.aimX,
          ai.aimY,
          def.shell.radius,
          Math.min(1, ai.phaseTicks / def.windupTicks),
        );
      } else if (def.behavior === 'boss') {
        const st = w.get(e, 'boss');
        const pattern = st
          ? def.phases[st.phase]?.patterns[
              st.current % (def.phases[st.phase]?.patterns.length ?? 1)
            ]
          : undefined;
        if (st?.step === 'windup' && pattern)
          this.bossTelegraph(
            p.x,
            p.y,
            body.radius,
            st.aimX,
            st.aimY,
            pattern,
            Math.min(1, st.ticks / pattern.windupTicks),
          );
      } else if (def.behavior === 'blinker' && ai.phase === 'channel') {
        // Shimmer where it will appear: turn around!
        const k = Math.min(1, ai.phaseTicks / def.blinkTicks);
        ctx.strokeStyle = `rgba(200, 220, 255, ${0.3 + k * 0.6})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(ai.aimX, ai.aimY, body.radius * (2 - k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (def.behavior === 'healer' && ai.phase === 'channel') {
        const k = Math.min(1, ai.phaseTicks / def.channelTicks);
        ctx.strokeStyle = `rgba(255, 140, 70, ${0.2 + k * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, def.healRadius * k, 0, Math.PI * 2);
        ctx.stroke();
      } else if (def.behavior === 'burrower' && ai.phase === 'windup') {
        this.telegraphCircle(
          ai.aimX,
          ai.aimY,
          def.emerge.radius,
          Math.min(1, ai.phaseTicks / def.emergeTicks),
        );
      } else if (def.behavior === 'summoner' && ai.phase === 'channel') {
        const progress = Math.min(1, ai.phaseTicks / def.channelTicks);
        ctx.fillStyle = `rgba(199, 125, 255, ${0.1 + progress * 0.15})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, body.radius * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Pending explosions (death fuses).
    for (const [e, hb, t] of w.query('hitbox', 'transform')) {
      if (hb.delay <= 0 || w.get(e, 'renderable')?.kind !== 'explosion') continue;
      if (hb.shape.kind !== 'circle') continue;
      if (hb.team === 'player') {
        // Friendly (meteor) markers: violet, with a shrinking ring = time to impact.
        const k = Math.min(1, hb.delay / ARCANIST.ultimate.fallTicks);
        ctx.strokeStyle = 'rgba(199, 125, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(t.x, t.y, hb.shape.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(199, 125, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, hb.shape.radius * (1 - k), 0, Math.PI * 2);
        ctx.fill();
        // Falling rock.
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.arc(t.x + k * 40, t.y - k * 160, 6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      this.telegraphCircle(t.x, t.y, hb.shape.radius, 1 - hb.delay / 20);
    }
  }

  /** Straight charge lane, filling with the windup; solid once the aim is locked. */
  private telegraphLane(
    x: number,
    y: number,
    angle: number,
    length: number,
    halfWidth: number,
    progress: number,
    locked: boolean,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.telegraph;
    ctx.fillRect(0, -halfWidth, length * progress, halfWidth * 2);
    ctx.strokeStyle = locked ? PALETTE.telegraphEdge : PALETTE.telegraph;
    ctx.lineWidth = locked ? 2 : 1;
    ctx.setLineDash(locked ? [] : [6, 6]);
    ctx.strokeRect(0, -halfWidth, length, halfWidth * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  private crosshair(x: number, y: number, radius: number, progress: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = PALETTE.telegraphEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius * (1.6 - progress * 0.6), 0, Math.PI * 2);
    ctx.moveTo(x - radius, y);
    ctx.lineTo(x + radius, y);
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x, y + radius);
    ctx.stroke();
  }

  /** Every boss attack shows its shape while winding up. */
  private bossTelegraph(
    x: number,
    y: number,
    r: number,
    ax: number,
    ay: number,
    p: BossPattern,
    progress: number,
  ): void {
    const ctx = this.ctx;
    const angle = Math.atan2(ay - y, ax - x);
    switch (p.kind) {
      case 'slam':
        this.telegraphCircle(x, y, p.radius, progress);
        break;
      case 'cone':
        ctx.fillStyle = PALETTE.telegraph;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, p.range * progress, angle - p.arc / 2, angle + p.arc / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = PALETTE.telegraphEdge;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, p.range, angle - p.arc / 2, angle + p.arc / 2);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'volley':
      case 'nova': {
        const n = p.count;
        ctx.strokeStyle = PALETTE.telegraphEdge;
        ctx.globalAlpha = 0.3 + progress * 0.5;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a =
            p.kind === 'nova'
              ? angle + (i / n) * Math.PI * 2
              : angle + (n === 1 ? 0 : (i / (n - 1) - 0.5) * p.spread);
          ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          ctx.lineTo(
            x + Math.cos(a) * (r + 60 + 80 * progress),
            y + Math.sin(a) * (r + 60 + 80 * progress),
          );
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        break;
      }
      case 'charge':
        this.telegraphLane(
          x,
          y,
          angle,
          p.speed * (p.durationTicks / 60),
          r + 6,
          progress,
          progress > 0.66,
        );
        break;
      case 'rain':
        this.crosshair(ax, ay, p.spread * 0.5, progress);
        break;
      case 'summon':
        ctx.fillStyle = `rgba(199, 125, 255, ${0.1 + progress * 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  private telegraphCircle(x: number, y: number, radius: number, progress: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.telegraph;
    ctx.beginPath();
    ctx.arc(x, y, radius * Math.max(0, Math.min(1, progress)), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.telegraphEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawSlashes(game: Game, fx: Effects, alpha: number): void {
    const ctx = this.ctx;
    const trim = CLASSES.shadowBlade.palette.trim;
    for (const s of fx.slashes) {
      const ot = game.world.get(s.owner, 'transform');
      const { x, y } = ot ? interp(ot, alpha) : s;
      const t = 1 - s.life / s.maxLife;
      const sweep = Math.min(1, t * 3);
      // Alternate swing direction between combo hits.
      const dir = s.combo % 2 === 0 ? 1 : -1;
      const start = s.angle - (dir * s.arc) / 2;
      const end = start + dir * s.arc * sweep;
      const outer = s.range * (1 + t * 0.12);
      const inner = s.range * (s.combo === 2 ? 0.35 : 0.5);
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = s.combo === 2 ? '#ffffff' : '#ece6ff';
      ctx.beginPath();
      ctx.arc(x, y, outer, start, end, dir < 0);
      ctx.arc(x, y, inner, end, start, dir > 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, outer, start, end, dir < 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const b of fx.blinks) {
      const k = b.life / b.maxLife;
      ctx.globalAlpha = k;
      ctx.strokeStyle = CLASSES.shadowBlade.palette.eyes;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath();
      ctx.moveTo(b.fromX, b.fromY);
      ctx.lineTo(b.toX, b.toY);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemyBars(game: Game, alpha: number): void {
    const ctx = this.ctx;
    const w = game.world;
    for (const [e, , t, h, body] of w.query('enemy', 'transform', 'health', 'body')) {
      const p = interp(t, alpha);
      const y = p.y - body.radius - 9;
      const wdt = Math.max(20, body.radius * 2);
      if (h.hp < h.max || w.has(e, 'elite')) {
        ctx.fillStyle = PALETTE.hpBack;
        ctx.fillRect(p.x - wdt / 2, y, wdt, 3);
        ctx.fillStyle = w.has(e, 'elite') ? PALETTE.crit : PALETTE.hp;
        ctx.fillRect(p.x - wdt / 2, y, (wdt * h.hp) / h.max, 3);
      }
      const statuses = w.get(e, 'statuses')?.list ?? [];
      statuses.forEach((s, i) => {
        ctx.fillStyle = STATUSES[s.id].color;
        const sx = p.x - wdt / 2 + i * 6 + 2;
        if (s.id === 'mark') {
          ctx.beginPath();
          ctx.moveTo(sx, y - 7);
          ctx.lineTo(sx + 3, y - 4);
          ctx.lineTo(sx, y - 1);
          ctx.lineTo(sx - 3, y - 4);
          ctx.fill();
        } else {
          ctx.fillRect(sx - 2, y - 6, 4, 4);
        }
      });
    }
  }

  private drawHitboxes(game: Game): void {
    const ctx = this.ctx;
    const w = game.world;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#3cff8f';
    for (const [, t, b] of w.query('transform', 'body')) {
      ctx.strokeRect(t.x - b.radius, t.y - b.radius, b.radius * 2, b.radius * 2);
      ctx.beginPath();
      ctx.arc(t.x, t.y, b.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const [, hb, t] of w.query('hitbox', 'transform')) {
      ctx.strokeStyle =
        hb.delay > 0
          ? '#888888'
          : hb.team === 'player'
            ? '#4dc3ff'
            : hb.team === 'neutral'
              ? '#ffb347'
              : '#ff4d4d';
      ctx.beginPath();
      if (hb.shape.kind === 'arc') {
        ctx.moveTo(t.x, t.y);
        ctx.arc(t.x, t.y, hb.shape.range, hb.angle - hb.shape.arc / 2, hb.angle + hb.shape.arc / 2);
        ctx.closePath();
      } else {
        ctx.arc(
          t.x + Math.cos(hb.angle) * hb.shape.offset,
          t.y + Math.sin(hb.angle) * hb.shape.offset,
          hb.shape.radius,
          0,
          Math.PI * 2,
        );
      }
      ctx.stroke();
    }
    for (const [, f, t] of w.query('facing', 'transform')) {
      ctx.strokeStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(f.angle) * 20, t.y + Math.sin(f.angle) * 20);
      ctx.stroke();
    }
    // A* paths.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    for (const [, ai, t] of w.query('enemy', 'transform')) {
      if (ai.path.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      for (const n of ai.path) {
        const c = game.map.tileCenter(n.tx, n.ty);
        ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
    }
  }

  /** Static tiles are pre-rendered once per map (doors, cracks and stairs are drawn per frame). */
  private mapCanvas(map: TileMap, pal: BiomePalette): HTMLCanvasElement {
    if (this.mapCache?.map === map && this.mapCache.palette === pal) return this.mapCache.canvas;
    const s = map.tileSize;
    const canvas = document.createElement('canvas');
    canvas.width = map.width * s;
    canvas.height = map.height * s;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    const wallAt = (tx: number, ty: number): boolean => {
      const t = map.get(tx, ty);
      return !map.inBounds(tx, ty) || t === Tile.Wall || t === Tile.Cracked;
    };
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const x = tx * s;
        const y = ty * s;
        // Visual-only hash: deterministic per tile without touching gameplay RNG.
        const h = hashString(`${tx},${ty}`);
        if (!wallAt(tx, ty)) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? pal.floorA : pal.floorB;
          ctx.fillRect(x, y, s, s);
          // Contact shadow at the foot of walls: sells their height.
          const ao = 11;
          const shadow = (x0: number, y0: number, x1: number, y1: number): void => {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, 'rgba(0,0,0,0.5)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(
              Math.min(x0, x1),
              Math.min(y0, y1),
              Math.abs(x1 - x0) || s,
              Math.abs(y1 - y0) || s,
            );
          };
          if (wallAt(tx, ty - 1)) shadow(x, y, x, y + ao);
          if (wallAt(tx, ty + 1)) shadow(x, y + s, x, y + s - ao);
          if (wallAt(tx - 1, ty)) shadow(x, y, x + ao, y);
          if (wallAt(tx + 1, ty)) shadow(x + s, y, x + s - ao, y);
          if (h % 7 === 0) {
            ctx.strokeStyle = pal.floorDetail;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + (h % s), y + 4);
            ctx.lineTo(x + ((h >> 5) % s), y + s / 2);
            ctx.lineTo(x + ((h >> 10) % s), y + s - 4);
            ctx.stroke();
          }
          continue;
        }
        let nearFloor = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (!wallAt(tx + dx, ty + dy)) nearFloor = true;
        if (!nearFloor) {
          // Deep rock: plain background so rooms and corridors read clearly.
          ctx.fillStyle = pal.background;
          ctx.fillRect(x, y, s, s);
          continue;
        }
        // Wall footprint: the 3D block itself is drawn every frame (render/depth.ts).
        ctx.fillStyle = pal.wallFace;
        ctx.fillRect(x, y, s, s);
      }
    }
    this.mapCache = { map, palette: pal, canvas };
    return canvas;
  }

  /** Doors, cracked walls and stairs: tiles that change during play. */
  private drawDynamicTiles(game: Game, pal: BiomePalette): void {
    const d = game.dungeon;
    if (!d) return;
    const ctx = this.ctx;
    const map = game.map;
    const s = map.tileSize;
    for (const room of d.floor.rooms) {
      for (const door of room.doors) {
        const x = door.tx * s;
        const y = door.ty * s;
        if (map.get(door.tx, door.ty) === Tile.DoorClosed) {
          // Drawn as a short 3D block by drawWalls3D.
          ctx.fillStyle = '#2a1f1a';
          ctx.fillRect(x, y, s, s);
        } else {
          ctx.fillStyle = pal.wallEdge;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
          ctx.globalAlpha = 1;
        }
      }
    }
    if (d.stairs) {
      const x = d.stairs.tx * s;
      const y = d.stairs.ty * s;
      const glow = 0.5 + Math.sin(this.time * 4) * 0.3;
      ctx.fillStyle = '#05040a';
      ctx.fillRect(x - 4, y - 4, s + 8, s + 8);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = `rgba(155, 123, 255, ${glow * (1 - i * 0.2)})`;
        ctx.fillRect(x - 2 + i * 3, y + i * 8, s + 4 - i * 6, 5);
      }
    }
  }

  /** Chests, shop pedestals, altars, then everything lying on the floor. */
  private drawLoot(game: Game, alpha: number): void {
    const ctx = this.ctx;
    const w = game.world;
    for (const [, it, t] of w.query('interactable', 'transform')) {
      const { x, y } = t;
      if (it.kind === 'chest') {
        ctx.fillStyle = it.opened ? '#3a2a18' : '#6b4a24';
        ctx.fillRect(x - 13, y - 8, 26, 16);
        ctx.fillStyle = it.locked ? '#e0b84d' : '#a8865a';
        ctx.fillRect(x - 13, y - 2, 26, 3);
        if (!it.opened) {
          // Lid, with a padlock when it needs a key.
          ctx.fillStyle = '#7a5630';
          ctx.fillRect(x - 13, y - 12, 26, 5);
          if (it.locked) {
            ctx.fillStyle = '#ffd34d';
            ctx.fillRect(x - 3, y - 4, 6, 6);
          }
        }
      } else if (it.kind === 'shop') {
        ctx.fillStyle = '#3a3350';
        ctx.fillRect(x - 10, y - 4, 20, 12);
        if (!it.sold) {
          const bob = Math.sin(this.time * 3 + x) * 2;
          const o = it.offer;
          const color =
            o.type === 'item'
              ? RARITIES[o.item.rarity].color
              : o.type === 'consumable'
                ? CONSUMABLES[o.id].color
                : o.type === 'relic'
                  ? RELICS[o.id].color
                  : '#ffd34d';
          this.drawLootIcon(x, y - 14 + bob, o.type === 'item' ? o.item.slot : o.type, color);
          ctx.font = 'bold 9px ui-monospace, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffd34d';
          ctx.fillText(`${it.price}`, x, y + 18);
        }
      } else {
        ctx.fillStyle = '#4a3a5e';
        ctx.fillRect(x - 16, y - 6, 32, 14);
        ctx.fillStyle = it.used ? '#3a3350' : '#c77dff';
        ctx.globalAlpha = it.used ? 0.6 : 0.5 + Math.sin(this.time * 2) * 0.3;
        ctx.beginPath();
        ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const [, pk, t] of w.query('pickup', 'transform')) {
      const p = interp(t, alpha);
      const bob = Math.sin(this.time * 4 + p.x * 0.1) * 1.5;
      if (pk.kind === 'gold') {
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y + bob,
          3.5 * Math.abs(Math.cos(this.time * 6 + p.x)) + 0.8,
          3.5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (pk.kind === 'key') {
        this.drawLootIcon(p.x, p.y + bob, 'key', '#ffd34d');
      } else if (pk.kind === 'consumable') {
        this.drawLootIcon(p.x, p.y + bob, 'consumable', CONSUMABLES[pk.id].color);
      } else {
        const color = pk.kind === 'item' ? RARITIES[pk.item.rarity].color : RELICS[pk.id].color;
        // Light beam: rarity readable from across the room.
        const g = ctx.createLinearGradient(p.x, p.y - 40, p.x, p.y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, color);
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 3) * 0.1;
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 3, p.y - 40, 6, 40);
        ctx.globalAlpha = 1;
        this.drawLootIcon(p.x, p.y + bob, pk.kind === 'item' ? pk.item.slot : 'relic', color);
      }
    }
  }

  private drawLootIcon(x: number, y: number, kind: string, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0b0910';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (kind === 'weapon') {
      ctx.rotate(-0.8);
      ctx.rect(-1.5, -9, 3, 14);
      ctx.rect(-4, 3, 8, 2);
    } else if (kind === 'armor') {
      ctx.moveTo(-7, -6);
      ctx.lineTo(7, -6);
      ctx.lineTo(5, 7);
      ctx.lineTo(-5, 7);
      ctx.closePath();
    } else if (kind === 'key') {
      ctx.arc(-3, 0, 3, 0, Math.PI * 2);
      ctx.rect(0, -1, 8, 2);
    } else if (kind === 'consumable') {
      ctx.arc(0, 2, 5, 0, Math.PI * 2);
      ctx.rect(-2, -6, 4, 5);
    } else {
      // relic / equipment relic: a gem
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6, 0);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** "E : …" prompt over the nearest interactable. */
  private drawPrompt(game: Game): void {
    const e = nearestInteractable(game);
    const near = nearestInspectable(game);
    const ctx = this.ctx;
    const key = keyLabel(KEY_BINDINGS.interact[0]);
    let text = '';
    let x = 0;
    let y = 0;
    if (near !== null && game.world.get(near, 'pickup')?.kind === 'relic') {
      const t = game.world.req(near, 'transform');
      text = `${key} : prendre`;
      x = t.x;
      y = t.y - 22;
    } else if (e !== null) {
      const it = game.world.req(e, 'interactable');
      const t = game.world.req(e, 'transform');
      x = t.x;
      y = t.y - 30;
      text =
        it.kind === 'chest'
          ? `${key} : ouvrir${it.locked ? ' (1 clé)' : ''}`
          : it.kind === 'shop'
            ? `${key} : acheter (${it.price} or)`
            : `${key} : prier`;
    }
    if (!text) return;
    ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - w / 2, y - 8, w, 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y + 3);
  }

  /** Unexplored tiles are hidden (fog of war). */
  private drawFog(game: Game, camera: Camera, pal: BiomePalette): void {
    const d = game.dungeon;
    if (!d) return;
    const ctx = this.ctx;
    const map = game.map;
    const s = map.tileSize;
    const halfW = this.width / 2 / camera.zoom + s;
    const halfH = this.height / 2 / camera.zoom + s;
    const x0 = Math.max(0, Math.floor((camera.x - halfW) / s));
    const x1 = Math.min(map.width - 1, Math.ceil((camera.x + halfW) / s));
    const y0 = Math.max(0, Math.floor((camera.y - halfH) / s));
    const y1 = Math.min(map.height - 1, Math.ceil((camera.y + halfH) / s));
    ctx.fillStyle = pal.background;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!d.floor.explored[ty * map.width + tx])
          ctx.fillRect(tx * s - 0.5, ty * s - 0.5, s + 1, s + 1);
      }
    }
  }
}
