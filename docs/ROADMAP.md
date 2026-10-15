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

## M1 – livré

- Tilemap + `moveAndCollide` (AABB par axe, sous-pas anti-tunneling) + raycast DDA `lineOfSight`.
- Arène de test data-driven (`data/arenas.ts`) avec vagues infinies (taille croissante).
- **Lame d'Ombre v1** (`data/classes.ts`) :
  - combo 3 coups (clic gauche, maintien = enchaînement), annulation de la récupération dans le coup suivant, finisher qui étourdit ;
  - shuriken à courte portée (clic droit) ;
  - dash à 2 charges (Espace), i-frames, annule l'attaque, conserve un peu d'élan ;
  - kill = +1 charge de dash et +énergie (boucle de reset) ;
  - **dos** : coup critique garanti ×1.6 dans le cône arrière de la cible.
- Buffer d'input (9 ticks) pour ne perdre aucun appui pendant hit-stop/récupération.
- **Goule** : chase → wind-up télégraphé (zone rouge, tremblement, tourne lentement : on peut la contourner) → frappe → récupération. Étourdissement = wind-up interrompu.
- Navigation : flow field BFS partagé vers le joueur + ligne droite quand le corps entier a la vue.
- Murs bloquent les coups (line of sight), séparation douce des corps, knockback amorti.
- Game feel : hit-stop, screen shake (trauma²), flash blanc, particules, nombres flottants (crit / DOS), traînée de dash, slash animé, barre de PV « lag », vignette de dégâts, sons procéduraux Web Audio.
- Debug : hitboxes + facing (F4), commandes `heal`, `god`, `spawn`, `killall`, `dash`, `seed`, `restart`.
- 54 tests (RNG, boucle, ECS, collisions, LOS, navigation, combat, IA, déterminisme de simulation).

### Reporté volontairement

- Voile de fumée, Exécution (ultime), énergie consommée → M2 (nécessitent statuts + perte de cible de l'IA).
- A* générique + steering anti-empilement → M2 (le flow field couvre la poursuite du joueur).

## M2 – livré

- **Pipeline de dégâts unique** (`systems/damage.ts`) : multiplicateurs de statuts, knockback, hit-stop,
  i-frames, énergie, vol de vie, morts et effets de mort au même endroit (coups, DoT, explosions, ultime).
- **Statuts** data-driven (`data/statuses.ts`) : ralenti, étourdi, peste (DoT), marque, invisible, embuscade.
- **Lame d'Ombre complète** :
  - Voile de fumée (touche A en AZERTY / Q en QWERTY) : zone d'invisibilité, sortir du voile (ou le voir
    expirer) = Embuscade → prochaine attaque critique garantie ;
  - Exécution (R) : jusqu'à 5 téléportations dans le dos, priorité aux cibles marquées puis aux plus
    blessées, dégâts ×(1 + 1,5 × PV manquants), invulnérable pendant l'enchaînement ;
  - passif : un coup dans le dos marque la cible (+15 % dégâts subis).
- **Jauge d'ultime (choix 1c)** : énergie gagnée aux kills ET aux dégâts infligés.
- **IA** (`systems/ai/`) : perception (alerte, dernière position connue, invisibilité), steering
  (flow field vers le joueur, A* pour les autres buts, séparation anti-empilement), 4 comportements :
  - Goule / Larve (mêlée), Archer d'ossuaire (distance, recule, visée qui se verrouille, tir ralentissant),
  - Boursouflé (kamikaze : mèche, explosion neutre qui empoisonne et blesse aussi les ennemis, explose
    à retardement quand on le tue → réactions en chaîne créditées au joueur),
  - Cryptomancien (invocateur : canalisation interruptible, plafond de larves).
- **Voile vs IA (choix 2b)** : les ennemis qui perdent la cible dans la fumée s'en approchent et frappent
  des points aléatoires à l'intérieur (télégraphiés, cooldown ×1,6).
- **Élites** : bonus de base + modificateurs (Enragé, Cuirassé, Vampirique, Instable), auras colorées.
- **Vagues** tirées d'un pool pondéré par vague, chance d'élite croissante.
- **A*** (tas binaire, octile, sans couper les coins) testé contre le BFS sur 200 cartes aléatoires.
- Feel : télégraphes par type, fumée, distorsion d'invisibilité, traits de téléportation, explosions,
  icônes de statut, HUD des compétences (libellés de touches selon la disposition réelle via
  `navigator.keyboard.getLayoutMap` quand disponible), sons dédiés.
- Debug : `elite`, `ult`, `status`, chemins A* affichés avec F4 ; la console s'ouvre sans perdre de frappe.
- 88 tests.
