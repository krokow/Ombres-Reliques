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

## Équipe (M4)

- **Un seul corps, trois « âmes »** : le joueur reste une entité stable (les ennemis, la caméra et les
  systèmes ne changent jamais de cible) ; switcher réinstalle les composants du perso choisi. Simple et
  sans cas particuliers.
- **Cooldowns (choix 2c)** : global 1 s + verrou 4 s sur celui qui sort → on alterne vraiment entre
  les trois au lieu de faire des allers-retours.
- **Sortir purge** les statuts du perso qui sort : le switch devient aussi un outil défensif.
- **Énergie par perso** (chacun charge son ultime), gagnée seulement par le perso actif.
- **Kits** : chaque classe implémente `Kit` (update, busy, moveFactor, entry, hud). Les kits et les
  systèmes dégâts/équipe s'importent mutuellement : la résolution se fait à l'appel (`kitFor`).
- **E = interaction** (autel aujourd'hui, coffres/boutique en M6).

## Progression (M5)

- **Pas de pause (choix 1b)** : un roguelike d'action perd son rythme si chaque niveau gèle l'écran.
  Les choix s'accumulent ; le panneau s'ouvre de lui-même aux moments calmes (salle nettoyée).
- **Cartes à chaque niveau + talents tous les 3 niveaux (choix 2c)** : les cartes donnent la variété
  (tirage), les talents la direction du build (choix délibéré dans un arbre).
- **Évolutions** = cartes rares de niveau 5+ qui changent une compétence (pas juste un chiffre).
- **Données** : `data/progression.ts` (courbe, cartes, arbres), `data/mods.ts` (modificateurs neutres).
  Les effets sont des `Mods` additifs + des `FlagId` lus par les kits : ajouter une carte chiffrée ne
  demande aucun code.
- **Déterminisme** : offres tirées sur le flux RNG `progress` ; les clics UI deviennent des
  `ProgressAction` dans l'`InputFrame`.

## Loot (M6)

- **Comparaison passive (choix 1b)** : pas d'inventaire à gérer, la décision se prend sur place, au
  calme ou en courant ; s'éloigner = laisser l'objet. L'ancien objet retombe : rien n'est perdu.
- **Équiper n'importe quel perso** : l'objet est lié à celui qui le porte, mais on choisit qui.
- **Consommables sur 2 emplacements (choix 2a)**, la bombe est neutre (risque/récompense, casse les secrets).
- **Équipement = modificateurs** agrégés comme les cartes et talents (`recompute`), donc aucune règle
  spéciale côté combat ; les reliques d'équipe ajoutent leurs `Mods`/`FlagId` à chaque membre.
- **Malédictions = reliques négatives** : même système, affichées avec un liseré rouge.
- Clé de départ : 1, pour que le premier coffre ne soit jamais frustrant.

## Biomes & boss (M7)

- **3 étages par biome (choix 1b)** : les deux premiers étages montent en tension avec des meutes de
  champions (contenu procédural, coût de design nul), le troisième offre les rencontres écrites à la main.
- **Boss = données** (`BossEnemyDef.phases[].patterns[]`) : un seul moteur, 7 motifs réutilisables.
  Chaque motif a une phase de télégraphe qui suit puis se fige (fenêtre d'esquive lisible).
- **Contrôle des boss** : jamais interrompus (pas de stun-lock), étourdissements ×0,15-0,25.
- **Mode infini (choix 2b)** : même contenu, `difficultyFor(level)` = scaling par étage × scaling de boucle.

## Méta et sauvegarde (M8)

- **Deux classes à débloquer (choix 1a)**, complètes (kit, 3 cartes dont une évolution, arbre 3×3) :
  - **Invocateur** : fouet d'âme long et étroit qui marque ; feux-follets autonomes (plafond 4, 15 s)
    qui ciblent d'abord les ennemis marqués ; « Ordre » lance toutes les invocations sur l'ennemi
    sous le curseur ; la mobilité échange sa place avec un feu-follet ; ultime « Colosse d'os ».
    Passif : un ennemi tué près de lui peut se relever en feu-follet. Les invocations restent en jeu
    quand on switche : l'Invocateur prépare le terrain pour les autres.
  - **Berserker** : rage (coups donnés et reçus, décroît hors combat) qui augmente dégâts et vol de
    vie ; tourbillon payé en PV ; bond qui s'écrase à l'atterrissage ; ultime « Frénésie » (rage
    bloquée au max, impossible de descendre sous 1 PV).
- **Invocations** (`systems/allies.ts`) : corps alliés (équipe `player`), les ennemis ne les
  chassent pas mais leurs attaques les touchent (elles bloquent les projectiles). Leurs dégâts
  chargent l'ultime de l'Invocateur, sans hit-stop (sinon le jeu saccade).
- **Monnaie : les Éclats**, versés à la fin de chaque run (mort, abandon ou victoire encaissée) :
  profondeur, mini-boss et boss vaincus, victoire, éliminations. Achats au **Sanctuaire** : les deux
  classes, deux reliquaires (certaines reliques ne tombent qu'une fois débloquées), quatre
  améliorations permanentes **volontairement légères** (+5 % PV par rang, or et potion de départ,
  réanimation entre étages).
- **Sauvegarde (choix 2b)** : la méta + la run **reprenable au début de l'étage en cours**. Chaque
  étage commence « à neuf » (recharges, dashs, statuts, boucliers remis à zéro), ce qui rend
  l'instantané de début d'étage complet : reprendre redonne exactement la même partie (testé sur
  400 ticks avec les flux RNG restaurés). Quitter en plein étage fait donc rejouer cet étage.
- **Format versionné** (`save/save.ts`) : `version` + chaîne de migrations (v1 = méta seule →
  v2 = run, historique, stats, réglages ; v1 n'a jamais été publiée, elle sert à éprouver la chaîne).
  Tout est assaini au chargement (identifiants inconnus filtrés, run invalide écartée sans perdre la
  méta) ; une sauvegarde illisible est mise de côté (`….corrupt`) plutôt qu'écrasée ; une version
  future n'est jamais mal lue. Sans `localStorage` (navigation privée…), le jeu tourne en mémoire.
- **Défi du jour** : seed `JOUR-AAAAMMJJ` (date locale) et équipe tirée de ce seed parmi les
  **5 classes, même verrouillées** (avant-goût), sans améliorations permanentes et avec toutes les
  reliques : même partie pour tout le monde. Rejouable, mais seule la première tentative du jour
  rapporte (×1,5).
- **Menus** en DOM (`ui/menus.ts`) : titre, sélection d'équipe (ordre = touches 1/2/3, seed libre),
  Sanctuaire, historique (20 dernières runs + totaux), commandes, pause (Échap) et fin de run. Les
  menus mettent le jeu en pause ; les panneaux en jeu (cartes, objets) ne le font toujours pas.
- **Statistiques de run** (`game/runStats.ts`) calculées par la simulation à partir de ses propres
  événements : elles voyagent dans l'instantané et restent déterministes.

## Polish (M9)

- **Tutoriel (choix 1c)** :
  - **Entraînement** guidé (`data/tutorial.ts`, `systems/tutorial.ts`) : 10 étapes dans l'arène
    (déplacement, combo, dash, dos, tir, voile, switch, blocage, ultime, combat). La logique vit dans la
    simulation (objectifs comptés sur ses propres événements, mannequins = ennemis étourdis dos
    tourné), l'équipe ne peut pas tomber sous 1 PV. Proposé en tête de l'écran titre tant qu'il n'a
    pas été fait ou passé ; toujours rejouable.
  - **Astuces contextuelles** (`data/hints.ts`, `ui/hints.ts`) : 10 astuces, chacune affichée une
    seule fois, jamais bloquantes, pendant les 5 premières runs ; désactivables, « revoir les astuces »
    dans les Options. Les textes utilisent les vraies touches du joueur.
- **Audio** : musique procédurale (drone filtré + arpège clairsemé, gammes par biome dans
  `data/music.ts`, pulsation ajoutée pendant les combats à portes scellées), LCG fixe pour les notes.
  Volumes effets/musique séparés.
- **Jamais coincé dans un mur** : `moveAndCollide` sort d'abord un corps qui chevauche déjà un mur
  (sinon chaque axe échoue et il reste figé) ; un héros plus large qui entre en jeu contre un mur est
  replacé ; l'Échange de l'Invocateur vérifie que le corps tient à l'arrivée ; et un filet de sécurité
  (`keepBodiesFree`, deux fois par tick) ramène tout corps hors d'un mur ou de la carte vers la place
  libre la plus proche ou sa dernière position sûre. Dans la séparation des corps, la foule cède devant
  le joueur (poids ×4) : on ne peut plus être écrasé dans un coin. Test de stress : un bot chaotique
  sur plusieurs étages, toutes classes, vérifié à chaque tick.
- **Musique (v2)** : la première version (drone en dent de scie + arpège aléatoire) était désagréable ;
  remplacée par des nappes d'accords douces (triangle/sinus, attaques lentes), une basse et quelques
  notes de cloche prises dans l'accord, progressions par biome dans `data/music.ts`, niveau bas.
- **Particules d'ambiance** par biome (poussière, spores, braises), position = fonction pure de
  l'indice et du temps, ancrées au monde.
- **Accessibilité** : tremblements de caméra désactivables. L'overlay debug est masqué par défaut
  (seul un petit compteur FPS reste), F3 l'affiche.
- **Équilibrage par sonde** (`tools/balance.ts`) : un bot naïf (pas d'esquive, ni talents ni objets)
  affronte chaque boss à son étage avec chaque classe seule ; le test garde-fou exige une victoire en
  < 3 min et un écart < 2× entre classes. La sonde a révélé un vrai bug : les gros corps restaient
  coincés sur les coins de piliers (le flow field vise le centre des tuiles) → répulsion des murs
  proportionnelle au rayon dans le steering. Le Gardien, nettement en retrait, a gagné ~17 % de dégâts
  de masse.
- **Déploiement (choix 2a)** : GitHub Actions → GitHub Pages depuis la branche par défaut ; CI sur
  toutes les branches et PR.

## Animation

- Purement côté rendu (`Animator`), pilotée par la vitesse, les événements et l'état des attaques :
  aucune donnée d'animation n'influence la simulation (les hitboxes restent celles des données).

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
