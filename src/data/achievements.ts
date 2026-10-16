import type { ClassId } from './classes';
import type { DifficultyId } from './dungeon';

/** Declarative achievement conditions, checked when a run is banked. */
export type AchievementCondition =
  | { kind: 'floor'; floor: number }
  | { kind: 'victory'; difficulty?: DifficultyId }
  | { kind: 'fastVictory'; minutes: number }
  | { kind: 'totalKills'; kills: number }
  | { kind: 'bestiary'; bosses: boolean }
  | { kind: 'daily' }
  | { kind: 'allClassesWon'; classes: readonly ClassId[] };

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** Éclats granted once, when unlocked. */
  reward: number;
  condition: AchievementCondition;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'deep3',
    name: 'Premiers pas',
    desc: 'Atteindre l’étage 3',
    reward: 5,
    condition: { kind: 'floor', floor: 3 },
  },
  {
    id: 'crypt',
    name: 'Pilleur de tombes',
    desc: 'Sortir de la crypte (étage 4)',
    reward: 10,
    condition: { kind: 'floor', floor: 4 },
  },
  {
    id: 'forest',
    name: 'Au-delà des ronces',
    desc: 'Atteindre la forge (étage 7)',
    reward: 15,
    condition: { kind: 'floor', floor: 7 },
  },
  {
    id: 'victory',
    name: 'Les reliques sont vôtres',
    desc: 'Remporter une run',
    reward: 30,
    condition: { kind: 'victory' },
  },
  {
    id: 'victoryHard',
    name: 'Endurci',
    desc: 'Gagner en Difficile',
    reward: 40,
    condition: { kind: 'victory', difficulty: 'hard' },
  },
  {
    id: 'victoryNightmare',
    name: 'Éveillé du cauchemar',
    desc: 'Gagner en Cauchemar',
    reward: 80,
    condition: { kind: 'victory', difficulty: 'nightmare' },
  },
  {
    id: 'speed',
    name: 'Course d’ombre',
    desc: 'Gagner en moins de 25 minutes',
    reward: 40,
    condition: { kind: 'fastVictory', minutes: 25 },
  },
  {
    id: 'endless',
    name: 'Sans fin',
    desc: 'Atteindre l’étage 12 (mode infini)',
    reward: 40,
    condition: { kind: 'floor', floor: 12 },
  },
  {
    id: 'slayer',
    name: 'Moissonneur',
    desc: '1000 éliminations au total',
    reward: 30,
    condition: { kind: 'totalKills', kills: 1000 },
  },
  {
    id: 'bestiary',
    name: 'Naturaliste',
    desc: 'Vaincre chaque type d’ennemi',
    reward: 40,
    condition: { kind: 'bestiary', bosses: false },
  },
  {
    id: 'bosses',
    name: 'Tueur de géants',
    desc: 'Vaincre les six boss',
    reward: 50,
    condition: { kind: 'bestiary', bosses: true },
  },
  {
    id: 'daily',
    name: 'Rendez-vous quotidien',
    desc: 'Terminer un défi du jour',
    reward: 10,
    condition: { kind: 'daily' },
  },
  {
    id: 'allClasses',
    name: 'Polyvalent',
    desc: 'Gagner avec chacune des 5 classes dans l’équipe',
    reward: 60,
    condition: {
      kind: 'allClassesWon',
      classes: ['shadowBlade', 'guardian', 'arcanist', 'summoner', 'berserker'],
    },
  },
];
