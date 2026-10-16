# Ombres & Reliques

Roguelike d'action en vue du dessus, jouable dans le navigateur. TypeScript strict, Canvas 2D,
moteur maison (ECS + boucle à pas fixe), zéro asset externe.

## Commandes

| Commande          | Rôle                                                         |
| ----------------- | ------------------------------------------------------------ |
| `npm run dev`     | serveur de dev Vite (HMR)                                    |
| `npm run build`   | typecheck + build statique dans `dist/`                      |
| `npm run preview` | sert le build                                                |
| `npm test`        | tests unitaires (Vitest)                                     |
| `npm run lint`    | ESLint + vérification Prettier                               |
| `npm run format`  | formatage Prettier                                           |
| `npm run balance` | sonde d'équilibrage (temps pour tuer chaque boss par classe) |

Le jeu s'ouvre sur l'écran titre : continuer la run sauvegardée, nouvelle run (choix de l'équipe, du
seed et de la difficulté), défi du jour, Sanctuaire (méta), historique, commandes. `?seed=XXXX` dans l'URL lance
directement une run sur ce seed.

## Déploiement

Le workflow `.github/workflows/pages.yml` lance lint, tests et build à chaque push et pull request, puis
publie `dist/` sur GitHub Pages quand la branche par défaut est poussée (Settings → Pages → Source :
GitHub Actions). Le build est entièrement statique et relatif (`base: './'`) : `dist/` peut aussi être
déposé tel quel sur n'importe quel hébergeur de fichiers statiques.

## Structure

```
src/
  core/     RNG seedable, boucle à pas fixe, maths — sans DOM
  ecs/      World générique + définition des composants
  dungeon/  génération procédurale des étages (BSP + marche aléatoire, validation)
  systems/  logique de simulation (fonctions pures sur le World)
  game/     orchestration de la simulation (ordre des systèmes), InputFrame
  data/     toutes les valeurs d'équilibrage et définitions (classes, ennemis…)
  input/    clavier/souris (→ InputFrame)
  render/   caméra, rendu Canvas 2D, effets visuels
  audio/    sons procéduraux Web Audio
  ui/       menus (titre, équipe, Sanctuaire…), panneaux en jeu, overlay debug, console
  save/     méta-progression et sauvegarde localStorage versionnée (migrations)
tests/      Vitest
tools/      sonde d'équilibrage (bot headless)
docs/       DESIGN.md, ROADMAP.md
```

## Contrôles

| Action                                | Touche                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| Bouger                                | ZQSD (AZERTY) / WASD (QWERTY) / flèches — touches physiques |
| Viser                                 | souris                                                      |
| Attaque principale                    | clic gauche (maintenir pour enchaîner)                      |
| Action secondaire                     | clic droit                                                  |
| Mobilité (dash, charge, blink, bond…) | Espace                                                      |
| Compétence / ultime                   | A (AZERTY) ou Q (QWERTY) / R                                |
| Changer de héros                      | 1 / 2 / 3                                                   |
| Interagir / consommables              | E / F, G                                                    |
| Progression (cartes, talents) / carte | C / Tab                                                     |
| Pause (retour au titre, abandon)      | Échap                                                       |
| Nouvelle run / même seed (fin de run) | Entrée / Retour arrière                                     |
| Son on/off                            | M                                                           |
| Overlay debug / hitboxes / console    | F3 / F4 / `²`                                               |

Commandes console : `help`, `heal`, `god`, `spawn <id ennemi> [n]` (ex. `spawn cryptarch`),
`elite <ennemi> [enraged|armored|vampiric|volatile]`, `ult`, `status <id> [ticks]`, `killall`, `dash`,
`seed [valeur]`, `restart`, `ko`, `revive`, `xp <n>`, `next`, `floor <n>`, `reveal`, `tp <boss|miniboss|shop|…>`, `arena`,
`shards <n>` (Éclats), `unlockall`.
