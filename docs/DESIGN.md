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

## Kit de la Lame d'Ombre (M2)

| Slot               | Touche         | Effet                             |
| ------------------ | -------------- | --------------------------------- |
| Attaque            | clic G         | combo 3 coups ; clic D : shuriken |
| Actif 1 (mobilité) | Espace         | dash à charges, reset au kill     |
| Actif 2            | A (AZERTY) / Q | Voile de fumée                    |
| Ultime             | R              | Exécution                         |
| Passif             | —              | dos = crit garanti + marque       |

- **E est réservé à l'interaction** (coffres, autels, boutique) à partir de M6 ; chaque classe aura donc
  sa mobilité sur Espace, sa compétence sur A, son ultime sur R.
- **Ultime = énergie (choix 1c)** : kills (+15) et dégâts infligés (+0,2/pt). Une seule ressource lisible.
- **Voile (choix 2b)** : l'ennemi qui perd sa cible dans la fumée va au voile et frappe des points
  aléatoires dedans. Ces frappes restent télégraphiées et ont un cooldown ×1,6 (`AI.blindCooldownMult`)
  pour que le voile garde sa valeur défensive.
- **Embuscade** : accordée en sortant du voile _ou_ quand il expire sur soi ; consommée par le premier coup
  qui touche (pas par un coup dans le vide).
- **Exécution** : cibles verrouillées au lancement, priorité marque > % PV ; les cibles mortes entre-temps
  sont sautées ; échec sans cible = pas de coût.

## Combat (M2)

- **`dealDamage` est l'unique point d'entrée** des dégâts : toute règle (marque, vol de vie, énergie,
  effets de mort) est donc garantie quelle que soit la source.
- **Équipe `neutral`** pour les explosions : elles blessent tout le monde ; `creditPlayer` attribue les
  kills au joueur quand c'est lui qui a déclenché la mort (réactions en chaîne récompensées).
- **Stagger vs stun** : le stagger est une réaction courte aux coups (interrompt wind-up et canalisation),
  le stun est un statut. Une mèche allumée n'est jamais interrompue.
- **Élites** : `ELITE` (bonus de base) × modificateurs ; tout est dans `data/elites.ts`.

## Navigation

- Flow field BFS 8-directions (sans couper les coins) vers la tuile du joueur, recalculé seulement
  quand le joueur change de tuile : un calcul pour tous les poursuivants.
- Si les deux bords du corps ont la ligne de vue → ligne droite (mouvement naturel en espace ouvert).
- A* (tas binaire, heuristique octile, sans couper les coins) pour tout autre but : dernière position
  connue, points dans le voile. Chemin mis en cache, recalculé au plus toutes les 20 ticks ou si le but
  change de tuile.
- Steering : direction de seek + répulsion des voisins (anti-empilement) ; la séparation positionnelle
  reste en filet de sécurité.
- Perception : un ennemi « alerté » suit le joueur tant qu'il n'est pas invisible et reste dans
  `sightRange × 1.6` ; sinon il cherche la dernière position connue puis abandonne.

## Présentation

- Aucun `Math.random` : les effets visuels ont leur propre `Rng` fixe, l'audio un LCG fixe.
- Sprites 100 % vectoriels dessinés en code (`render/sprites.ts`), tilemap pré-rendue dans un canvas
  hors écran.
- HUD sur canvas (pas de churn DOM), overlay debug/console en DOM (texte net, saisie native).
- Audio : oscillateurs + bruit filtré, `AudioContext` créé au premier geste (politique autoplay).

## Donjon (M3)

- **BSP + marche aléatoire (choix 1d)** : la BSP garantit une structure lisible et des couloirs
  propres ; la marche aléatoire ne fait qu'« habiller » (bords, couverture) et ne peut jamais casser
  la connectivité (chaque groupe d'obstacles est annulé s'il coupe sa salle, l'érosion ne touche ni
  couloir ni autre salle et reste à ≤ 2 tuiles du rectangle d'origine).
- **Graphe lu depuis les tuiles** plutôt que depuis la liste des couloirs creusés : un couloir qui
  traverse une salle crée bien la connexion réelle.
- **Mini-boss obligatoire** : la salle du boss est un cul-de-sac dont l'unique voisin est la salle du
  mini-boss ; comme celle-ci se scelle à l'entrée, impossible de l'éviter.
- **Portes (choix 2c)** : ouvertes partout sauf mini-boss/boss, scellées dès que le joueur est à plus de
  1,5 tuile de toute porte (les corps dans l'encadrement sont repoussés à l'intérieur).
- **Rencontres à l'entrée** (et non pré-placées) : moins d'entités actives, et le tirage seedé reste
  stable quel que soit l'ordre d'exploration (flux RNG `spawn`).
- **Escalier** : il faut _marcher_ dessus (pas de descente surprise si on se trouve au centre quand
  le boss meurt).
- **Rendu** : les tuiles statiques sont pré-rendues ; portes, mur fissuré et escalier sont dessinés à
  chaque frame (pas d'invalidation coûteuse du cache). Version de la tilemap → le flow field se
  recalcule quand une porte change.
- Biome par étage provisoire (1 étage = 1 biome) ; M7 donnera plusieurs étages et un bestiaire par biome.

## Dépendances

Uniquement dev : vite, typescript, vitest, eslint (+ @eslint/js, typescript-eslint,
eslint-config-prettier, globals), prettier. Aucune dépendance runtime.
