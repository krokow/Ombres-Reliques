# Roadmap

| Milestone               | Contenu                                                                                           | État |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| M0 – Fondations         | Vite + TS strict, lint, tests, boucle à pas fixe, ECS, rendu canvas, input, caméra, overlay debug | ✅   |
| M1 – Perso jouable      | mouvement, collisions grille, attaque de base, dash, ennemi simple, Lame d'Ombre v1               | ⏳   |
| M2 – Combat complet     | dégâts, statuts, hitboxes, IA + A*, types d'ennemis, game feel                                    | ⬜   |
| M3 – Donjon procédural  | salles, portes, minimap, RNG seedé, tests de solvabilité                                          | ⬜   |
| M4 – Équipe et switch   | 3 persos, switch, effets d'entrée, KO/réanimation, 2 classes                                      | ⬜   |
| M5 – Progression        | XP, level-up à choix, talents, évolutions                                                         | ⬜   |
| M6 – Loot               | objets, affixes, raretés, coffres, boutique, autels, consommables                                 | ⬜   |
| M7 – Boss et biomes     | 3 biomes, mini-boss, boss à phases, scaling                                                       | ⬜   |
| M8 – Méta et sauvegarde | déblocages, sauvegarde versionnée, écran titre, sélection, daily seed                             | ⬜   |
| M9 – Polish             | audio, particules, équilibrage, tutoriel, déploiement                                             | ⬜   |

## M0 – livré

- Projet Vite + TS strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`…), ESLint (typescript-eslint strict) + Prettier, Vitest.
- `FixedStepClock` 60 Hz avec accumulateur, cap anti « spiral of death », alpha d'interpolation.
- `World<C>` ECS générique typé (stores par composant, `query` typé en tuple, destruction différée).
- `Rng` mulberry32 + `fork(label)` pour des sous-flux indépendants.
- Rendu Canvas 2D DPR-aware, caméra à suivi exponentiel + lookahead vers la souris.
- Input par `KeyboardEvent.code` (ZQSD/WASD automatique), buffer d'appuis consommés par tick.
- Overlay debug (FPS, tick, entités, seed, position) + console de commandes (`help`, `seed`, `restart`).
