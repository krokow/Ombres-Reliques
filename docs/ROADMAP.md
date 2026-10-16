# Roadmap

| Milestone               | Contenu                                                                                           | État |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| M0 – Fondations         | Vite + TS strict, lint, tests, boucle à pas fixe, ECS, rendu canvas, input, caméra, overlay debug | ✅   |
| M1 – Perso jouable      | mouvement, collisions grille, attaque de base, dash, ennemi simple, Lame d'Ombre v1               | ✅   |
| M2 – Combat complet     | dégâts, statuts, hitboxes, IA + A*, types d'ennemis, game feel                                    | ✅   |
| M3 – Donjon procédural  | salles, portes, minimap, RNG seedé, tests de solvabilité                                          | ✅   |
| M4 – Équipe et switch   | 3 persos, switch, effets d'entrée, KO/réanimation, 2 classes                                      | ✅   |
| M5 – Progression        | XP, level-up à choix, talents, évolutions                                                         | ✅   |
| M6 – Loot               | objets, affixes, raretés, coffres, boutique, autels, consommables                                 | ✅   |
| M7 – Boss et biomes     | 3 biomes, mini-boss, boss à phases, scaling                                                       | ✅   |
| M8 – Méta et sauvegarde | déblocages, sauvegarde versionnée, écran titre, sélection, daily seed                             | ✅   |
| M9 – Polish             | audio, particules, équilibrage, tutoriel, déploiement                                             | ⏳   |

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

## M3 – livré

- **Génération (choix 1d)** `src/dungeon/generate.ts` : BSP (72×54 tuiles) → une salle par feuille →
  couloirs en L de 2 tuiles reliant les sous-arbres + ~20 % de boucles → portes et graphe des salles
  **déduits des tuiles** (robuste même quand un couloir traverse une salle).
- **Rôles** : départ à une extrémité du graphe ; boss = cul-de-sac le plus profond (≥ 3 salles) dont
  l'unique voisin devient la salle du mini-boss (point de passage obligatoire) ; boutique, autel,
  1-2 trésors en priorité dans les culs-de-sac ; salle secrète derrière un mur fissuré.
- **Habillage par biome (marche aléatoire)** : crypte = piliers, forêt corrompue = bords érodés +
  bosquets, forge = érosion légère + éboulis. Tout obstacle qui couperait une salle est annulé.
- **Validation** à chaque génération (sinon nouvel essai, déterministe) : tout est atteignable, le
  secret seulement via son mur, le boss uniquement via le mini-boss.
- **Rencontres** : déclenchées en entrant (loin des portes), composition seedée selon la taille de la
  salle et l'étage ; **portes scellées seulement pour mini-boss et boss (choix 2c)** ; barre de PV du
  champion ; escalier après le boss (il faut marcher dessus) → étage suivant (+25 % PV).
- **Scaling par étage** (data) : PV ennemis +18 %/étage, dégâts +10 %/étage, plus d'ennemis, plus d'élites.
- **Brouillard de guerre** (exploration en ligne de vue + salle révélée à l'entrée), **minimap** avec icônes
  (B, M, $, T, A, ?) et carte étendue (Tab).
- Props provisoires (coffre, boutique, autel) en attendant M6. Mur fissuré cassable par n'importe quelle
  attaque du joueur.
- Debug : `next`, `floor <n>`, `reveal`, `tp <type>`, `arena` ; F4 affiche aussi les chemins A*.
- Tests : 300 seeds × 3 étages validés, déterminisme, couloirs ≥ 2 de large partout, boss derrière le
  mini-boss, secrets, rencontres, portes, escalier, scaling, run complète déterministe — 103 tests.
- Génération ≈ 2 ms par étage.

## M4 – livré

- **Équipe de 3** (Lame d'Ombre, Gardien, Arcaniste — choix 1a), un seul corps à l'écran : les
  composants propres à chaque perso (PV, dash, combo, statuts, état du kit) sont échangés au switch.
- **Switch (choix 2c)** sur 1/2/3 : cooldown global 1 s + verrou de retour 4 s pour celui qui sort,
  appui bufferisé, i-frames brèves. Sortir purge les statuts. Réserve : régénération 2 %/s, cooldowns,
  recharges et mana continuent de tourner.
- **Effets d'entrée** : Lame (invisible + Embuscade), Gardien (onde de choc + bouclier), Arcaniste
  (nova de givre).
- **KO** : relais automatique vers le perso suivant ; run perdue quand les 3 tombent. Réanimation à
  l'étage suivant (30 % PV) ou à l'**autel** (E) contre 25 % des PV du perso actif.
- **Gardien** : masse 2 coups larges, bouclier directionnel (−80 % de face, parade parfaite = 0 dégât +
  étourdissement de l'attaquant), charge, provocation (les tireurs viennent au contact, −30 % dégâts),
  Bastion (onde étourdissante + gros bouclier), bouclier qui se régénère hors combat, énergie en encaissant.
- **Arcaniste** (mana) : traits arcaniques (1 sur 3 perce), orbe de givre au curseur, blink, brasier,
  pluie de météores télégraphiés ; passif +20 % sur les cibles ralenties.
- **Architecture** : `systems/kits/` (un kit par classe derrière une interface `Kit`), briques
  génériques dans `systems/player.ts`, équipe dans `systems/team.ts`, données dans `data/classes.ts`
  et `data/team.ts`. Les hitboxes retiennent leur classe d'origine (crit/passifs corrects après switch).
- **Animations procédurales** (`render/anim.ts`) : cycle de marche, respiration, inclinaison,
  squash & stretch sur ressort, recul à l'impact, pop d'entrée au switch ; poses d'armes dérivées de
  l'état réel des attaques (dague, masse, bouclier levé, bâton qui pousse/canalise) ; mort qui
  s'effondre, KO en fantôme, image rémanente du perso qui sort.
- HUD : portraits d'équipe (PV, énergie, verrou, KO), cases de compétences fournies par chaque kit,
  bouclier et mana.
- Debug : `ko`, `revive`. 135 tests.

## M5 – livré

- **XP par personnage** : kills (valeur par ennemi, ×2,5 élite, ×5 champion) ; actif 100 %, réserve
  40 %, KO 0 %. Courbe `40 × niveau^1,35`, niveau max 20.
- **Niveaux sans pause (choix 1b)** : chaque niveau met un choix de côté ; panneau non bloquant (C),
  ouvert automatiquement quand une salle est nettoyée avec des choix en attente. Badge ▲ sur les portraits.
- **Cartes + talents (choix 2c)** : à chaque niveau, 1 carte parmi 3 (tirage seedé, pondéré, distinct,
  limité par niveau minimum et cumuls) ; 1 point de talent tous les 3 niveaux dans un arbre de
  3 branches × 3 paliers par classe.
- **Contenu** : 7 cartes communes, 3 cartes par classe dont une **évolution** (niveau 5) :
  Danse des lames (traînée de dash qui blesse), Séisme (charge → onde de choc), Fracture (le givre fige les
  cibles déjà ralenties) ; 9 talents par classe dont 3 capstones (Pas de l'ombre, Marque de mort, Reset
  total, Contre-choc, Élan, Ralliement, Sillage glacé, Cratères, Traits jumeaux).
- **Modificateurs** agrégés par perso (`Mods` + `FlagId`) : PV, dégâts, crit, vitesse, recharges
  (globales / compétence / principale / dash), charges de dash, énergie, vol de vie, spécifiques de kit.
- Les choix passent par l'`InputFrame` (`progress`) : une run reste rejouable à l'identique.
- Debug : `xp <n>`. 158 tests.

## M6 – livré

- **Équipement** (arme, armure, relique perso) : 4 raretés (commun → légendaire), stat implicite par
  emplacement + 0 à 3 affixes sans doublon, niveau d'objet = étage ; raretés meilleures en profondeur.
- **Comparaison sans pause (choix 1b)** : se tenir sur un objet affiche sa fiche face à l'équipement des
  3 persos (écarts en vert/rouge), « Équiper » sur n'importe qui (l'ancien tombe au sol) ou « Recycler » en or.
- **Consommables sur F / G (choix 2a)** : potion de vie, bombe (explosion neutre à retardement, casse les
  murs fissurés), parchemin de foudre (dégâts + étourdissement en zone) ; piles de 3.
- **Butin** : or à chaque kill (aimanté), clés, consommables et objets selon des tables (élites et
  champions bien mieux dotés ; le boss lâche un épique+ et une relique).
- **Coffres** : verrouillés (clé) dans les salles au trésor → épique+, libre dans la salle secrète.
- **Boutique** : 4 présentoirs (2 objets, 1 consommable, relique ou clé), prix selon rareté et étage, E pour acheter.
- **Autel** : Rappel (réanimer), Saignée (−15 % PV max du perso actif → relique), Pacte (objet légendaire
  - malédiction). Un seul usage.
- **Reliques d'équipe** : Cape d'ombre (+30 % invisible), Sablier fêlé (switch −40 %), Totem du relais
  (+25 % dégâts à l'entrée), Cœur partagé, Pierre de sang, Œil du chasseur, Dent d'or, Lanterne, Plume de
  phénix ; **malédictions** : fragilité, traque, disette.
- Toutes les actions d'UI (cartes, talents, équiper, recycler, autel) passent par `UiAction` dans
  l'`InputFrame` ; tirages sur le flux RNG `loot`.
- 178 tests.

## M7 – livré

- **Structure (choix 1b)** : 3 étages par biome, 9 étages : crypte → forêt corrompue → forge volcanique.
  Étages 1-2 d'un biome : salles mini-boss/boss gardées par des **meutes de champions** (double élite +
  escorte du bestiaire) ; étage 3 : **vrai mini-boss** puis **vrai boss** du biome.
- **Victoire et mode infini (choix 2b)** : battre le boss de l'étage 9 = victoire (Entrée : nouvelle run) ;
  l'escalier continue en boucle sur les biomes, ×1,4 PV et ×1,2 dégâts ennemis par boucle en plus du
  scaling par étage.
- **Bestiaires** (5-6 types par biome) : Crypte (+ Chevalier des tombes), Forêt (Loup-ronce, Tireur d'épines
  en éventail, Sporelin, Chaman des racines + Jeunes pousses, Cerf maudit), Forge (Diablotin de cendre, Golem
  de magma, Mortier de braise, Scorie vive, Contremaître de forge, Taureau d'airain).
- **Nouveaux comportements** : chargeur (couloir télégraphié qui suit puis se verrouille, étourdi s'il
  percute un mur) et artillerie (obus retardés sur la position du joueur, avec dispersion).
- **Boss data-driven** : phases déclenchées par seuils de PV (rugissement invulnérable), rotation de
  motifs télégraphiés — impact, cône, salve, nova, invocation, charge, pluie — plus rapides à chaque phase ;
  immunisés aux interruptions, étourdissements réduits. 6 boss : Gardien d'ossuaire, Le Cryptarque,
  Mère-Ronce, Le Cerf Pâle, Forgeron déchu, Cœur de la Forge.
- **Sprites par famille** (`look`) : chevalier, bête (pattes animées, bois/cornes), golem (fissures
  lumineuses), diablotin, mortier ; couronne et aura pour les boss ; télégraphes dédiés (couloirs, viseurs,
  cônes, éventails de tirs).
- HUD : étage dans le biome (« 2/3 »), boucle en mode infini, bandeau de victoire.
- 191 tests (bestiaires, structure, chaque motif de chaque boss, phases, victoire → mode infini).

## M8 – livré

- **Deux classes à débloquer (choix 1a)**, complètes :
  - **Invocateur** : fouet d'âme qui marque, feux-follets autonomes (ciblent les marqués), « Ordre »
    (toutes les invocations foncent sur l'ennemi visé), échange de place avec un feu-follet, ultime
    Colosse d'os ; passif Moisson (les ennemis tués près de lui se relèvent en feux-follets) ;
    entrée avec 2 feux-follets ; les invocations continuent de se battre quand il est en réserve.
  - **Berserker** : rage (coups donnés/reçus, kills) → dégâts et vol de vie ; haches en 3 temps, jet
    de hache perçant qui ralentit, Bond qui s'écrase, Tourbillon payé en PV, Frénésie (rage max,
    increvable à 1 PV) ; passif Sang chaud sous 40 % PV ; entrée en onde de choc.
  - 3 cartes chacun (évolutions Tempête d'âmes / Maelström) et un arbre 3 branches × 3 paliers.
  - Sprites procéduraux animés (robe en lambeaux et lanterne, fouet spectral ; haches, cornes, aura
    de rage, toupie), feux-follets, colosse, haches en vol ; sons dédiés.
- **Méta** : Éclats gagnés en fin de run ; Sanctuaire (2 classes, 2 reliquaires, 4 améliorations
  légères) ; stats à vie.
- **Sauvegarde versionnée** (`save/`) avec migrations, assainissement, sauvegarde corrompue mise de
  côté, repli en mémoire sans `localStorage`.
- **Run reprenable au début de l'étage (choix 2b)** : instantané complet (équipe, progression,
  objets, reliques, flux RNG, stats) pris à chaque étage ; reprise vérifiée à l'identique.
- **Écran titre** (continuer, nouvelle run, défi du jour, Sanctuaire, historique, commandes),
  **sélection d'équipe** (ordre, seed libre), **pause** (Échap : reprendre, retour au titre,
  abandon), **fin de run** (stats, gains, même seed / nouvelle run), panneau de **victoire** (mode
  infini ou encaisser).
- **Défi du jour** : seed et équipe du jour, sans bonus permanents, récompense ×1,5 une fois par jour.
- Debug : `shards <n>`, `unlockall`. 221 tests.
