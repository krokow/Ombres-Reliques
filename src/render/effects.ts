import { Rng } from '../core/rng';
import type { Entity } from '../ecs/world';
import { BIOMES } from '../data/biomes';
import { CLASSES } from '../data/classes';
import { CONSUMABLES, RARITIES, RELICS, type RelicDef } from '../data/items';
import { FEEL } from '../data/combat';
import type { RoomType } from '../dungeon/floor';
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

/** Dying actor: collapses, spins and fades (death animation). */
interface Corpse {
  x: number;
  y: number;
  radius: number;
  body: string;
  dark: string;
  spin: number;
  life: number;
  maxLife: number;
  /** KO'd heroes rise as a fading ghost instead of collapsing. */
  ghost: boolean;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

const ROOM_NAMES: Partial<Record<RoomType, string>> = {
  treasure: 'Salle au trésor',
  shop: 'Boutique',
  altar: 'Autel',
  secret: 'Salle secrète',
  miniboss: 'Antre du gardien',
  boss: 'Salle du maître',
};

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
  corpses: Corpse[] = [];
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
        if (ev.ally) {
          this.flashes.set(ev.target, 0.08);
          this.burst(ev.x, ev.y, 5, '#5cffc4', 120, 0.3, Math.atan2(ev.dirY, ev.dirX), 1.2);
          break;
        }
        if (!ev.byPlayer && !ev.toPlayer) {
          // Enemy caught in a neutral blast: enemy feedback, not "you got hurt".
          this.flashes.set(ev.target, 0.08);
          this.burst(
            ev.x,
            ev.y,
            6,
            PALETTE.ghoulBlood,
            160,
            0.35,
            Math.atan2(ev.dirY, ev.dirX),
            1.2,
          );
          this.text(ev.x, ev.y - 14, `${ev.damage}`, PALETTE.damage, 10);
          break;
        }
        if (ev.fromAlly) {
          this.flashes.set(ev.target, 0.06);
          this.burst(ev.x, ev.y, 4, '#5cffc4', 160, 0.25, Math.atan2(ev.dirY, ev.dirX), 0.9, true);
          this.text(ev.x, ev.y - 14, `${ev.damage}`, '#a8ffe0', ev.crit ? 12 : 9);
          break;
        }
        if (!ev.byPlayer && ev.absorbed >= ev.damage) {
          this.text(ev.x, ev.y - 16, `(${ev.damage})`, '#dbe8ff', 11);
          this.flashes.set(ev.target, 0.06);
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
          this.corpses.push({
            x: ev.x,
            y: ev.y,
            radius: isEnemyId(ev.kind) ? ENEMIES[ev.kind].radius : 12,
            body: look?.body ?? PALETTE.ghoulBlood,
            dark: look?.dark ?? PALETTE.ghoulDark,
            spin: this.rng.range(-4, 4),
            life: 0.45,
            maxLife: 0.45,
            ghost: false,
          });
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
      case 'explosion': {
        camera.addTrauma(FEEL.shake.explosion);
        const [hot, cold] =
          ev.flavor === 'frost'
            ? ['#e6fbff', '#6fd0ff']
            : ev.flavor === 'arcane'
              ? ['#ffb347', '#c77dff']
              : ev.flavor === 'fire'
                ? ['#ffb347', '#ff5a2a']
                : [PALETTE.explosion, PALETTE.poison];
        this.burst(ev.x, ev.y, 26, hot, ev.radius * 5, 0.45, 0, Math.PI * 2, true);
        this.burst(ev.x, ev.y, 14, cold, ev.radius * 2.5, 0.8, 0, Math.PI * 2);
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: ev.radius,
          color: hot,
          life: 0.3,
          maxLife: 0.3,
        });
        break;
      }
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
      case 'roomEnter': {
        const name = ROOM_NAMES[ev.roomType];
        if (ev.firstVisit && name) this.banner = { text: name, life: 1.6, maxLife: 1.6 };
        break;
      }
      case 'doorsLocked':
        camera.addTrauma(0.35);
        this.banner = { text: 'Les portes se scellent', life: 1.4, maxLife: 1.4 };
        break;
      case 'roomCleared':
        if (ev.roomType === 'miniboss')
          this.banner = { text: 'Gardien vaincu', life: 1.6, maxLife: 1.6 };
        break;
      case 'stairsOpen':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 60,
          color: PALETTE.summon,
          life: 0.8,
          maxLife: 0.8,
        });
        this.banner = { text: 'L’escalier s’ouvre', life: 2, maxLife: 2 };
        break;
      case 'secretFound':
        camera.addTrauma(0.3);
        this.burst(ev.x, ev.y, 24, PALETTE.dust, 200, 0.7, 0, Math.PI * 2);
        this.banner = { text: 'Passage secret !', life: 1.6, maxLife: 1.6 };
        break;
      case 'floor':
        this.banner = {
          text: `Étage ${ev.level} — ${BIOMES[ev.biome].name}`,
          life: 2.4,
          maxLife: 2.4,
        };
        break;
      case 'switch': {
        const to = CLASSES[ev.to];
        const from = CLASSES[ev.from];
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 40,
          color: to.palette.trim,
          life: 0.35,
          maxLife: 0.35,
        });
        this.burst(ev.x, ev.y, 16, to.palette.trim, 180, 0.4, 0, Math.PI * 2, true);
        // The leaving hero lingers as an afterimage.
        this.corpses.push({
          x: ev.x,
          y: ev.y,
          radius: from.radius,
          body: from.palette.body,
          dark: from.palette.trim,
          spin: 0,
          life: 0.3,
          maxLife: 0.3,
          ghost: true,
        });
        this.text(ev.x, ev.y - 28, to.name, to.palette.trim, 10);
        break;
      }
      case 'ko': {
        const def = CLASSES[ev.classId];
        camera.addTrauma(0.6);
        this.corpses.push({
          x: ev.x,
          y: ev.y,
          radius: def.radius,
          body: def.palette.body,
          dark: def.palette.trim,
          spin: 0,
          life: 1.2,
          maxLife: 1.2,
          ghost: true,
        });
        this.banner = { text: `${def.name} est KO`, life: 1.6, maxLife: 1.6 };
        break;
      }
      case 'revive':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 70,
          color: '#fff3c4',
          life: 0.6,
          maxLife: 0.6,
        });
        this.burst(ev.x, ev.y, 30, '#fff3c4', 160, 0.8, -Math.PI / 2, Math.PI);
        this.banner = { text: 'L’équipe se relève', life: 1.6, maxLife: 1.6 };
        break;
      case 'block':
        this.burst(
          ev.x + Math.cos(ev.angle) * 16,
          ev.y + Math.sin(ev.angle) * 16,
          6,
          '#dbe8ff',
          160,
          0.2,
          ev.angle,
          1.2,
          true,
        );
        break;
      case 'parry':
        camera.addTrauma(0.25);
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 36,
          color: '#ffffff',
          life: 0.25,
          maxLife: 0.25,
        });
        this.burst(
          ev.x + Math.cos(ev.angle) * 18,
          ev.y + Math.sin(ev.angle) * 18,
          16,
          PALETTE.crit,
          300,
          0.3,
          ev.angle,
          1.6,
          true,
        );
        this.text(ev.x, ev.y - 26, 'PARADE !', PALETTE.crit, 13);
        break;
      case 'shockwave': {
        const color = {
          gold: '#ffcf5a',
          frost: '#bff0ff',
          violet: PALETTE.summon,
          blood: '#ff5a3d',
          soul: '#5cffc4',
        }[ev.color];
        camera.addTrauma(ev.radius > 120 ? 0.45 : 0.2);
        this.rings.push({ x: ev.x, y: ev.y, radius: ev.radius, color, life: 0.35, maxLife: 0.35 });
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: ev.radius * 0.6,
          color,
          life: 0.25,
          maxLife: 0.25,
        });
        this.burst(
          ev.x,
          ev.y,
          Math.round(ev.radius / 5),
          color,
          ev.radius * 3,
          0.4,
          0,
          Math.PI * 2,
        );
        break;
      }
      case 'taunt':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: ev.radius,
          color: '#ffcf5a',
          life: 0.5,
          maxLife: 0.5,
        });
        this.text(ev.x, ev.y - 28, 'PROVOCATION', '#ffcf5a', 11);
        break;
      case 'cast':
        if (ev.spell === 'bolt' || ev.spell === 'empowered') {
          this.burst(
            ev.x,
            ev.y,
            ev.spell === 'empowered' ? 10 : 4,
            '#bff0ff',
            140,
            0.2,
            ev.angle,
            0.8,
            true,
          );
        } else if (ev.spell === 'frost') {
          this.burst(ev.x, ev.y, 8, '#e6fbff', 100, 0.3, ev.angle, 1.2);
        } else if (ev.spell === 'fire') {
          this.burst(ev.x, ev.y, 18, '#ff8a3d', 160, 0.5, -Math.PI / 2, Math.PI);
        } else if (ev.spell === 'axe') {
          this.burst(ev.x, ev.y, 5, '#ffd0a8', 120, 0.2, ev.angle, 0.6, true);
        }
        break;
      case 'enemyHeal':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: ev.radius,
          color: '#ff8a3d',
          life: 0.5,
          maxLife: 0.5,
        });
        this.burst(ev.x, ev.y, 16, '#ffb070', 120, 0.6, -Math.PI / 2, Math.PI);
        this.text(ev.x, ev.y - 24, 'SOIN', '#ffb070', 10);
        break;
      case 'burrow':
        this.burst(ev.x, ev.y, 14, '#6a5038', 140, 0.5, 0, Math.PI * 2);
        break;
      case 'guardBlock':
        this.burst(
          ev.x + Math.cos(ev.angle) * 14,
          ev.y + Math.sin(ev.angle) * 14,
          6,
          '#ffe9a8',
          200,
          0.2,
          ev.angle,
          1.2,
          true,
        );
        break;
      case 'allySummon':
        this.burst(
          ev.x,
          ev.y,
          ev.kind === 'wisp' ? 10 : 30,
          '#5cffc4',
          140,
          0.5,
          -Math.PI / 2,
          Math.PI,
        );
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: ev.kind === 'wisp' ? 16 : 50,
          color: '#5cffc4',
          life: 0.35,
          maxLife: 0.35,
        });
        break;
      case 'allyFade':
        this.burst(
          ev.x,
          ev.y,
          ev.burst ? 20 : 8,
          ev.burst ? '#c8fff0' : '#5cffc4',
          ev.burst ? 260 : 80,
          0.5,
          0,
          Math.PI * 2,
          ev.burst,
        );
        if (ev.burst) {
          camera.addTrauma(0.12);
          this.rings.push({
            x: ev.x,
            y: ev.y,
            radius: 56,
            color: '#5cffc4',
            life: 0.3,
            maxLife: 0.3,
          });
        }
        break;
      case 'allyStrike':
        if (ev.kind === 'colossus') {
          camera.addTrauma(0.18);
          this.rings.push({
            x: ev.x,
            y: ev.y,
            radius: 58,
            color: '#e8e0cc',
            life: 0.3,
            maxLife: 0.3,
          });
          this.burst(ev.x, ev.y, 16, '#cfc6b0', 220, 0.4, 0, Math.PI * 2);
        } else {
          this.burst(ev.x, ev.y, 3, '#5cffc4', 90, 0.2, ev.angle, 0.5, true);
        }
        break;
      case 'command':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 28,
          color: '#fff0a0',
          life: 0.4,
          maxLife: 0.4,
        });
        this.text(ev.x, ev.y - 20, 'ORDRE', '#fff0a0', 10);
        break;
      case 'spin':
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: ev.radius,
          color: '#ff8a6a',
          life: 0.18,
          maxLife: 0.18,
        });
        this.burst(ev.x, ev.y, 6, '#d9dcf2', ev.radius * 4, 0.2, 0, Math.PI * 2, true);
        break;
      case 'frenzy':
        camera.addTrauma(0.4);
        this.text(ev.x, ev.y - 30, 'FRÉNÉSIE !', '#ff3a1a', 15);
        this.burst(ev.x, ev.y, 30, '#ff3a1a', 300, 0.5, 0, Math.PI * 2, true);
        break;
      case 'interactFail':
        this.text(ev.x, ev.y - 26, ev.reason, PALETTE.hudDim, 10);
        break;
      case 'levelUp': {
        const def = CLASSES[ev.classId];
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 50,
          color: '#9b7bff',
          life: 0.6,
          maxLife: 0.6,
        });
        this.burst(ev.x, ev.y, 24, '#c9b8ff', 180, 0.8, -Math.PI / 2, Math.PI);
        this.text(ev.x, ev.y - 34, `${def.name} niveau ${ev.level} !`, '#c9b8ff', 12);
        break;
      }
      case 'cardTaken':
      case 'talentTaken':
        break;
      case 'bossPhase':
        camera.addTrauma(0.7);
        this.banner = { text: `${ev.name} — phase ${ev.phase + 1}`, life: 1.8, maxLife: 1.8 };
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 120,
          color: '#ff5a6e',
          life: 0.6,
          maxLife: 0.6,
        });
        this.burst(ev.x, ev.y, 40, '#ff5a6e', 300, 0.7, 0, Math.PI * 2, true);
        break;
      case 'victory':
        this.banner = { text: 'Victoire !', life: 4, maxLife: 4 };
        break;
      case 'pickup':
        if (ev.label)
          this.text(
            ev.x,
            ev.y - 10,
            ev.label,
            ev.kind === 'gold' ? '#ffd34d' : '#e8e4f0',
            ev.kind === 'gold' ? 9 : 10,
          );
        break;
      case 'chestOpen':
        camera.addTrauma(0.2);
        this.burst(ev.x, ev.y, 30, '#ffd34d', 200, 0.7, -Math.PI / 2, Math.PI);
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 40,
          color: '#ffd34d',
          life: 0.4,
          maxLife: 0.4,
        });
        break;
      case 'purchase':
        this.burst(ev.x, ev.y, 12, '#ffd34d', 120, 0.5, -Math.PI / 2, Math.PI);
        this.text(ev.x, ev.y - 24, `−${ev.price} or`, '#ffd34d', 10);
        break;
      case 'relic': {
        const r: RelicDef = RELICS[ev.id];
        this.banner = { text: r.name, life: 2, maxLife: 2 };
        this.rings.push({ x: ev.x, y: ev.y, radius: 50, color: r.color, life: 0.6, maxLife: 0.6 });
        this.burst(ev.x, ev.y, 24, r.color, 180, 0.7, 0, Math.PI * 2);
        break;
      }
      case 'altarUsed':
        camera.addTrauma(0.3);
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 70,
          color: '#c77dff',
          life: 0.6,
          maxLife: 0.6,
        });
        this.burst(ev.x, ev.y, 30, '#c77dff', 160, 0.8, -Math.PI / 2, Math.PI);
        break;
      case 'equip':
        this.text(
          ev.x,
          ev.y - 20,
          `${CLASSES[ev.classId].name} : ${ev.name}`,
          RARITIES[ev.rarity].color,
          10,
        );
        this.rings.push({
          x: ev.x,
          y: ev.y,
          radius: 24,
          color: RARITIES[ev.rarity].color,
          life: 0.35,
          maxLife: 0.35,
        });
        break;
      case 'consumable':
        if (ev.id === 'potion') {
          this.burst(ev.x, ev.y, 18, '#ff4d6d', 90, 0.7, -Math.PI / 2, Math.PI * 0.8);
        } else if (ev.id === 'thunder') {
          camera.addTrauma(0.5);
          this.rings.push({
            x: ev.x,
            y: ev.y,
            radius: CONSUMABLES.thunder.radius,
            color: '#ffe14d',
            life: 0.4,
            maxLife: 0.4,
          });
          this.hurtFlash = 0;
          this.burst(ev.x, ev.y, 40, '#fff6b0', 500, 0.35, 0, Math.PI * 2, true);
        }
        break;
      case 'trail':
        this.burst(ev.x, ev.y, 3, CLASSES.shadowBlade.palette.trim, 40, 0.4, 0, Math.PI * 2, true);
        this.ghosts.push({ x: ev.x, y: ev.y, angle: 0, life: 0.35, maxLife: 0.35 });
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
    for (const c of this.corpses) c.life -= dt;
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
    this.corpses = this.corpses.filter((c) => c.life > 0);
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

  drawCorpses(ctx: CanvasRenderingContext2D): void {
    for (const c of this.corpses) {
      const k = 1 - c.life / c.maxLife;
      ctx.save();
      if (c.ghost) {
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.translate(c.x, c.y - k * 24);
        ctx.scale(1 + k * 0.3, 1 + k * 0.3);
      } else {
        ctx.globalAlpha = 1 - k;
        ctx.translate(c.x, c.y);
        ctx.rotate(c.spin * k);
        ctx.scale(1 + k * 0.4, Math.max(0.05, 1 - k));
      }
      ctx.fillStyle = c.body;
      ctx.beginPath();
      ctx.arc(0, 0, c.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
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
