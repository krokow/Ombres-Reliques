/**
 * Contextual tips (M9, design 1c): shown once each, during the first runs,
 * never blocking. Placeholders like {progress} become real key labels.
 */
export const HINTS = {
  levelUp: 'Niveau gagné ! Ouvre la progression avec {progress} (le jeu ne s’arrête pas).',
  item: 'Objet au sol : sa fiche le compare à l’équipement des 3 héros. Équipe-le sur qui tu veux.',
  lowHp: 'PV bas : change de héros ({slot1} {slot2} {slot3}). Ceux en réserve se soignent.',
  ko: 'Héros KO : il revient à l’étage suivant, ou tout de suite à un autel.',
  sealed: 'Salle de gardien : les portes restent scellées jusqu’à sa chute.',
  interact: 'Coffre, boutique ou autel : {interact} pour interagir.',
  consumable: 'Consommable rangé : {quick1} / {quick2} pour l’utiliser.',
  stairs: 'L’escalier est ouvert : marche dessus pour descendre (+25 % PV).',
  ultimate: 'Ultime prête : {ultimate} !',
  map: 'Perdu ? {map} affiche la carte de l’étage.',
} as const;

export type HintId = keyof typeof HINTS;

export const HINT_RULES = {
  /** Tips stop appearing after this many finished runs. */
  maxRuns: 5,
  durationSeconds: 7,
  lowHpFraction: 0.35,
} as const;
