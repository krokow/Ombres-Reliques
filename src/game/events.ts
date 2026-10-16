import type { Entity } from '../ecs/world';
import type { RenderKind } from '../ecs/components';
import type { StatusId } from '../data/statuses';
import type { BiomeId } from '../data/biomes';
import type { RoomType } from '../dungeon/floor';
import type { ClassId } from '../data/classes';
import type { ConsumableId, Rarity, RelicId } from '../data/items';
import type { AltarOption } from '../systems/loot';

/**
 * One-way notifications from the simulation to presentation (VFX, audio, HUD).
 * Presentation may react however it likes; it never feeds back into the sim.
 */
export type GameEvent =
  | {
      type: 'swing';
      owner: Entity;
      x: number;
      y: number;
      angle: number;
      arc: number;
      range: number;
      combo: number;
    }
  | { type: 'throw'; x: number; y: number; angle: number }
  | { type: 'dash'; x: number; y: number; dirX: number; dirY: number }
  | {
      type: 'hit';
      target: Entity;
      x: number;
      y: number;
      damage: number;
      crit: boolean;
      backstab: boolean;
      dirX: number;
      dirY: number;
      byPlayer: boolean;
      /** Damage over time: no shake, small numbers. */
      dot: boolean;
      /** Part of the damage soaked by a shield. */
      absorbed: number;
      /** The target is a summon (not the player). */
      ally: boolean;
      /** Dealt by a summon (lighter feedback). */
      fromAlly: boolean;
    }
  | {
      type: 'kill';
      target: Entity;
      kind: RenderKind;
      x: number;
      y: number;
      byPlayer: boolean;
      elite: boolean;
    }
  | { type: 'dashRefund'; x: number; y: number }
  | { type: 'windup'; entity: Entity }
  | { type: 'projectileWall'; x: number; y: number }
  | { type: 'enemyShoot'; x: number; y: number; angle: number }
  | {
      type: 'explosion';
      x: number;
      y: number;
      radius: number;
      /** 'frost' | 'arcane' for player spells, 'plague' for enemy/neutral blasts. */
      flavor: 'plague' | 'frost' | 'arcane' | 'fire';
    }
  | { type: 'summon'; x: number; y: number }
  | { type: 'status'; target: Entity; id: StatusId }
  | { type: 'veil'; x: number; y: number; radius: number }
  | { type: 'ambush'; x: number; y: number }
  | { type: 'ambushStrike'; x: number; y: number }
  | { type: 'ultStart'; x: number; y: number }
  | { type: 'ultFail'; x: number; y: number; reason: 'energy' | 'noTarget' }
  | { type: 'blink'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'playerDeath'; x: number; y: number }
  | { type: 'wave'; wave: number; count: number }
  | { type: 'roomEnter'; room: number; roomType: RoomType; firstVisit: boolean }
  | { type: 'doorsLocked'; room: number }
  | { type: 'roomCleared'; room: number; roomType: RoomType }
  | { type: 'stairsOpen'; x: number; y: number }
  | { type: 'secretFound'; x: number; y: number }
  | { type: 'floor'; level: number; biome: BiomeId }
  | { type: 'switch'; from: ClassId; to: ClassId; x: number; y: number; forced: boolean }
  | { type: 'ko'; classId: ClassId; x: number; y: number }
  | { type: 'revive'; classIds: ClassId[]; x: number; y: number }
  | { type: 'block'; x: number; y: number; angle: number }
  | { type: 'parry'; x: number; y: number; angle: number }
  | {
      type: 'shockwave';
      x: number;
      y: number;
      radius: number;
      color: 'gold' | 'frost' | 'violet' | 'blood' | 'soul';
    }
  | { type: 'allySummon'; kind: 'wisp' | 'colossus'; x: number; y: number }
  | { type: 'allyFade'; kind: 'wisp' | 'colossus'; x: number; y: number; burst: boolean }
  | { type: 'allyStrike'; kind: 'wisp' | 'colossus'; x: number; y: number; angle: number }
  | { type: 'command'; x: number; y: number; target: Entity | null }
  | { type: 'spin'; x: number; y: number; radius: number }
  | { type: 'frenzy'; x: number; y: number; on: boolean }
  | { type: 'taunt'; x: number; y: number; radius: number }
  | {
      type: 'cast';
      x: number;
      y: number;
      angle: number;
      spell: 'bolt' | 'empowered' | 'frost' | 'fire' | 'meteor' | 'axe';
    }
  | { type: 'interactFail'; x: number; y: number; reason: string }
  | { type: 'levelUp'; classId: ClassId; level: number; x: number; y: number }
  | { type: 'cardTaken'; classId: ClassId; card: string }
  | { type: 'talentTaken'; classId: ClassId; node: string }
  | { type: 'trail'; x: number; y: number }
  | {
      type: 'pickup';
      kind: 'gold' | 'key' | 'consumable';
      x: number;
      y: number;
      label: string;
      /** Gold gained (0 for other pickups). */
      amount: number;
    }
  | { type: 'relic'; id: RelicId; x: number; y: number }
  | { type: 'chestOpen'; x: number; y: number }
  | { type: 'purchase'; x: number; y: number; price: number }
  | { type: 'altarOpen'; altar: Entity; options: AltarOption[] }
  | { type: 'altarUsed'; option: AltarOption; x: number; y: number }
  | { type: 'equip'; classId: ClassId; name: string; rarity: Rarity; x: number; y: number }
  | { type: 'consumable'; id: ConsumableId; x: number; y: number }
  | { type: 'bossPhase'; entity: Entity; phase: number; name: string; x: number; y: number }
  | { type: 'victory'; level: number }
  | { type: 'tutorialStep'; step: number }
  | { type: 'tutorialDone' };
