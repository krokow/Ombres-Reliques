import type { ClassId } from './classes';
import type { EnemyId } from './enemies';

/**
 * Guided training room (M9, design 1c). Steps run in order in the test
 * arena; text placeholders like {attack} are replaced by the player's real
 * key labels by the UI.
 */
export type TutorialGoal =
  | { kind: 'move'; distance: number }
  | {
      kind: 'event';
      events: readonly ('dash' | 'throw' | 'veil' | 'switch' | 'block' | 'parry' | 'ultStart')[];
      count: number;
    }
  | { kind: 'backstab'; count: number }
  | { kind: 'kills'; count: number };

export interface TutorialSpawn {
  enemy: EnemyId;
  /** Offset from the player when the step starts. */
  dx: number;
  dy: number;
  /** Training dummy: stunned for the whole step, back turned to the player. */
  dummy?: boolean;
}

export interface TutorialStep {
  title: string;
  text: string;
  goal: TutorialGoal;
  spawn?: readonly TutorialSpawn[];
  /** Fills every hero's ultimate when the step starts. */
  fillEnergy?: boolean;
}

export const TUTORIAL_PARTY: readonly ClassId[] = ['shadowBlade', 'guardian', 'arcanist'];

export const TUTORIAL: readonly TutorialStep[] = [
  {
    title: 'Se déplacer',
    text: 'Bouge avec {up} {left} {down} {right}. La souris oriente le héros.',
    goal: { kind: 'move', distance: 500 },
  },
  {
    title: 'Attaquer',
    text: 'Frappe avec {attack}. Maintiens le bouton pour enchaîner le combo : le 3e coup étourdit.',
    goal: { kind: 'kills', count: 2 },
    spawn: [
      { enemy: 'ghoul', dx: 120, dy: -40, dummy: true },
      { enemy: 'ghoul', dx: 120, dy: 40, dummy: true },
    ],
  },
  {
    title: 'Esquiver',
    text: 'Dash avec {dash} : tu es invulnérable pendant le dash. Les charges se rechargent seules.',
    goal: { kind: 'event', events: ['dash'], count: 3 },
  },
  {
    title: 'Dans le dos',
    text: 'La Lame d’Ombre frappe fort dans le dos : contourne le mannequin et frappe-le par derrière.',
    goal: { kind: 'backstab', count: 1 },
    spawn: [{ enemy: 'tombKnight', dx: 110, dy: 0, dummy: true }],
  },
  {
    title: 'À distance',
    text: 'Lance des shurikens avec {ranged}. Chaque classe a sa propre action secondaire.',
    goal: { kind: 'event', events: ['throw'], count: 3 },
  },
  {
    title: 'Voile de fumée',
    text: 'Compétence {skill} : la fumée rend invisible, et en sortir donne une Embuscade (critique garanti).',
    goal: { kind: 'event', events: ['veil'], count: 1 },
  },
  {
    title: 'Changer de héros',
    text: 'Passe au Gardien ({slot2}) puis à l’Arcaniste ({slot3}). Chaque entrée en jeu déclenche un effet, et la réserve se soigne.',
    goal: { kind: 'event', events: ['switch'], count: 2 },
  },
  {
    title: 'Bloquer',
    text: 'Avec le Gardien ({slot2}), maintiens {ranged} face à la goule. Lever le bouclier juste avant l’impact = parade.',
    goal: { kind: 'event', events: ['block', 'parry'], count: 2 },
    spawn: [{ enemy: 'ghoul', dx: 140, dy: 0 }],
  },
  {
    title: 'Ultime',
    text: 'L’ultime ({ultimate}) se charge en frappant et en éliminant. Ici, elle est pleine : essaie-la.',
    goal: { kind: 'event', events: ['ultStart'], count: 1 },
    fillEnergy: true,
    spawn: [
      { enemy: 'ghoul', dx: 130, dy: -50, dummy: true },
      { enemy: 'ghoul', dx: 150, dy: 30, dummy: true },
    ],
  },
  {
    title: 'Combat',
    text: 'Dernière épreuve : élimine la vague. Pense au switch quand tes PV baissent.',
    goal: { kind: 'kills', count: 5 },
    spawn: [
      { enemy: 'ghoul', dx: 200, dy: -60 },
      { enemy: 'ghoul', dx: 220, dy: 60 },
      { enemy: 'ghoul', dx: -200, dy: 0 },
      { enemy: 'boneArcher', dx: 260, dy: 0 },
      { enemy: 'larva', dx: -220, dy: 60 },
    ],
  },
];

/** Dummies stay stunned this long (longer than any step needs). */
export const DUMMY_STUN_TICKS = 60 * 60 * 10;
