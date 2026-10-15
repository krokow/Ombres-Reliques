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

## Dépendances

Uniquement dev : vite, typescript, vitest, eslint (+ @eslint/js, typescript-eslint,
eslint-config-prettier, globals), prettier. Aucune dépendance runtime.
