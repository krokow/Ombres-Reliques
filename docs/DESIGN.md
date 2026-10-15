# Design & décisions techniques

## Architecture

- **Simulation sans DOM** (`core/`, `ecs/`, `systems/`, `game/`, `data/`) : testable en Node. Le rendu,
  l'input, l'audio et l'UI lisent l'état ou produisent un `InputFrame`, jamais l'inverse.
- **Boucle à pas fixe 60 Hz**, rendu interpolé entre `prev` et position courante (`Transform.prevX/Y`).
- **ECS** : une `Map<Entity, T>` par type de composant. Suffisant pour quelques centaines d'entités,
  bien plus simple que des archétypes. Composants = données pures, systèmes = fonctions `(world, …)`
  appelées dans un ordre explicite dans `Game.step`.
- **Destruction différée** (`world.destroy` → `flush()` en fin de tick) pour itérer sans risque.
- **RNG** : mulberry32 (rapide, 32 bits d'état, suffisant pour du jeu). `fork(label)` dérive un flux du
  _seed_ et non de l'état courant : ajouter un tirage en combat ne décale pas le donjon ni le loot.
  Seeds texte normalisés (trim + majuscules). Seule source non déterministe : le tirage d'un seed neuf.
- **Input** : bindings sur `KeyboardEvent.code` (position physique) → ZQSD sur AZERTY = WASD sur QWERTY.
  Les compétences A/E/R AZERTY correspondent aux codes `KeyQ/KeyE/KeyR`.
- **Caméra** côté rendu uniquement (la simulation ne la connaît pas). Suivi `1 - exp(-k·dt)`,
  indépendant du framerate.
- **Data-driven** : toute valeur d'équilibrage vit dans `src/data/`.

## Combat (M1)

- **Hitbox = entité** (`hitbox` + `transform`) : attachée au porteur (mêlée) ou mobile (projectile).
  Chaque hitbox touche une cible au plus une fois (`hit: Set`). Un seul code de résolution pour tout.
- **Pas de dégâts de contact** : les ennemis ne blessent que via des attaques télégraphiées → lisible et juste.
- **Dos** = crit garanti avec son propre multiplicateur (pas de cumul avec le multiplicateur de crit) :
  le burst reste lisible et équilibrable. Le cône arrière est `COMBAT.backstabHalfArc`.
- **Hit-stop** géré dans la simulation (ticks gelés, on garde la plus longue demande), car il change
  le timing du gameplay ; shake/particules/flash sont purement côté rendu.
- **Buffer d'input** : un appui reste « en attente » 9 ticks → combos et dash réactifs même pendant
  hit-stop ou récupération.
- **Dash** annule le coup en cours : rythme frappe → dash → frappe de l'assassin.
- **Reset au kill** : +1 charge de dash, +énergie. Valeurs dans `data/classes.ts`.
- **Poids** : divise le knockback reçu et la poussée de foule ; le joueur est plus lourd que les goules.

## Navigation

- Flow field BFS 8-directions (sans couper les coins) vers la tuile du joueur, recalculé seulement
  quand le joueur change de tuile : un calcul pour tous les poursuivants.
- Si les deux bords du corps ont la ligne de vue → ligne droite (mouvement naturel en espace ouvert).
- A* générique arrivera en M2 pour les cibles autres que le joueur (perte de cible, fuite, invocations).

## Présentation

- Aucun `Math.random` : les effets visuels ont leur propre `Rng` fixe, l'audio un LCG fixe.
- Sprites 100 % vectoriels dessinés en code (`render/sprites.ts`), tilemap pré-rendue dans un canvas
  hors écran.
- HUD sur canvas (pas de churn DOM), overlay debug/console en DOM (texte net, saisie native).
- Audio : oscillateurs + bruit filtré, `AudioContext` créé au premier geste (politique autoplay).

## Dépendances

Uniquement dev : vite, typescript, vitest, eslint (+ @eslint/js, typescript-eslint,
eslint-config-prettier, globals), prettier. Aucune dépendance runtime.
