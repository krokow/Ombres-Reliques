# Ombres & Reliques

Roguelike d'action en vue du dessus, jouable dans le navigateur. TypeScript strict, Canvas 2D,
moteur maison (ECS + boucle à pas fixe), zéro asset externe.

## Commandes

| Commande          | Rôle                                    |
| ----------------- | --------------------------------------- |
| `npm run dev`     | serveur de dev Vite (HMR)               |
| `npm run build`   | typecheck + build statique dans `dist/` |
| `npm run preview` | sert le build                           |
| `npm test`        | tests unitaires (Vitest)                |
| `npm run lint`    | ESLint + vérification Prettier          |
| `npm run format`  | formatage Prettier                      |

`?seed=XXXX` dans l'URL force un seed.

## Structure

```
src/
  core/     RNG seedable, boucle à pas fixe, maths — sans DOM
  ecs/      World générique + définition des composants
  systems/  logique de simulation (fonctions pures sur le World)
  game/     orchestration de la simulation (ordre des systèmes), InputFrame
  data/     toutes les valeurs d'équilibrage et définitions (classes, ennemis…)
  input/    clavier/souris (→ InputFrame)
  render/   caméra, rendu Canvas 2D, effets visuels
  audio/    sons procéduraux Web Audio
  ui/       overlay debug, console, HUD
  save/     sauvegarde localStorage versionnée (M8)
tests/      Vitest
docs/       DESIGN.md, ROADMAP.md
```

## Contrôles

| Action                                   | Touche                                                      |
| ---------------------------------------- | ----------------------------------------------------------- |
| Bouger                                   | ZQSD (AZERTY) / WASD (QWERTY) / flèches — touches physiques |
| Viser                                    | souris                                                      |
| Combo de mêlée                           | clic gauche (maintenir pour enchaîner)                      |
| Shuriken                                 | clic droit                                                  |
| Dash                                     | Espace                                                      |
| Nouvelle run / même seed (après la mort) | Entrée / Retour arrière                                     |
| Son on/off                               | M                                                           |
| Overlay debug / hitboxes / console       | F3 / F4 / `²`                                               |

Commandes console : `help`, `heal`, `god`, `spawn ghoul 5`, `killall`, `dash`, `seed [valeur]`, `restart`.
