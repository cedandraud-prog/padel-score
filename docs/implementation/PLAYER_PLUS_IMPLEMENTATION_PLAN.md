# PLAYER+ — Plan d’implémentation

## Statut du document

Design d’implémentation proposé à partir de l’ADR-011 acceptée et de l’état réel
du code. Ce document ne constitue pas une implémentation et ne valide pas encore
l’expérience PLAYER+ sur le terrain.

## 1. Décision d’architecture

PLAYER+ étend le vertical padel existant. Il ne crée ni second produit, ni second
moteur de score, ni second contrôleur de match.

L’implémentation doit conserver une seule chaîne d’exécution :

```text
MatchConfigurationDraft
        ↓
MatchController
        ↓
ScoreEngine + état de service du mode
        ↓
DisplayState / annonces / interface commune
```

Le mode est une donnée explicite qui sélectionne :

- le contrat de configuration ;
- la représentation des participants ;
- la politique de service ;
- la présentation du serveur.

Il ne sélectionne pas une nouvelle application.

## 2. État actuel observé

### Configuration

- `MatchConfiguration` connaît deux équipes, leurs noms affichés, leurs noms
  vocaux et l’équipe au service.
- `VoiceMatchSetup` porte un parcours linéaire exclusivement PLAYER.
- `MatchSetup` présente les valeurs obtenues mais ne propose pas encore les
  champs clavier prévus par l’ADR-011.
- `MatchController` possède déjà un brouillon unique, une révision de saisie et
  une protection contre une transcription vocale tardive.
- Le démarrage relit la configuration transmise, la valide, puis construit un
  nouveau `ScoreEngine`.

### Score et service

- `ScoreEngine` calcule les points, jeux, sets et tie-breaks sans dépendance à
  React, au navigateur ou à la voix.
- `MatchState` stocke actuellement `servingTeam` et
  `tieBreakInitialServer` au niveau de l’équipe.
- Le service change d’équipe après un jeu. En tie-break, une fonction pure
  calcule l’équipe au service à partir de l’équipe initiale et du nombre de
  points joués.
- Le serveur présenté peut être inversé par `MatchController` avec le booléen
  `servingTeamSwapped`. Cet état est extérieur au moteur et à son historique.

### Historique et corrections

- Chaque point et chaque correction de points enregistrent un instantané complet
  du `MatchState` avant mutation.
- `undo()` restaure exactement cet instantané, y compris après un jeu, un set,
  un tie-break ou une correction de points.
- La correction actuelle du serveur n’est pas une action du `ScoreEngine` : le
  booléen applicatif n’est donc pas restauré par le même historique. Cette dette
  doit être supprimée avant d’ajouter la correction d’un serveur individuel.
- Une correction de points pendant un tie-break recalcule déjà le service à
  partir de l’ancre du tie-break. PLAYER+ doit conserver ce principe avec une
  ancre individuelle.

### Orchestration, affichage et annonces

- `MatchController` est l’unique orchestrateur du score, de la session, des
  commandes et des annonces.
- `ConversationEngine`, `GameSession`, `ExperienceSession`, le Wake Lock et les
  stratégies d’écoute ne dépendent pas du modèle des participants. Ils restent
  communs.
- `MatchScreen` affiche une même page de score pour deux équipes et matérialise
  actuellement le service au niveau de l’équipe.
- Les annonces de score sont déjà produites par des fonctions pures. Seule la
  présentation du serveur doit devenir dépendante du mode.

## 3. Classification des éléments

| Élément                                | Décision                                               |
| -------------------------------------- | ------------------------------------------------------ |
| `ScoreEngine`                          | Étendre la classe existante, jamais la dupliquer       |
| Règles points, jeux, sets et tie-break | Inchangées                                             |
| Historique par instantanés             | Conservé et étendu à l’état de service                 |
| `MatchController`                      | Conserver, avec des branches centralisées par mode     |
| `ConversationEngine`                   | Inchangé                                               |
| `GameSession` et `ExperienceSession`   | Inchangés                                              |
| Wake Lock et stratégies d’écoute       | Inchangés                                              |
| `MatchConfiguration`                   | Étendre en union discriminée                           |
| `VoiceMatchSetup`                      | Composer des étapes par mode, ne pas créer un clone    |
| `MatchSetup`                           | Une page commune avec sections conditionnelles         |
| `MatchScreen`                          | Une page commune avec un panneau de service composable |
| Annonces de score                      | Conserver les formateurs communs                       |
| Annonces de serveur                    | Spécialiser la donnée présentée par mode               |
| Correction de serveur                  | Léger refactoring vers une action historisée du moteur |

Ne doivent jamais être dupliqués : règles de score, historique, contrôleur,
gestion conversationnelle, cycle de session, reconnaissance, synthèse, Wake
Lock, page de score et formateurs de score.

## 4. Modèle de configuration cible

La configuration applicative devient une union discriminée. Les consignes
vocales restent dans la couche application et ne sont pas injectées dans les
règles de score.

```ts
type GameMode = 'PLAYER' | 'PLAYERS_PLUS'
type PlayerSide = 'RIGHT' | 'LEFT'
type PlayerId = string

interface PlayerParticipant {
  id: PlayerId
  displayName: string
  teamId: TeamId
  side: PlayerSide
}

interface PlayerMatchConfiguration {
  mode: 'PLAYER'
  teams: Record<
    TeamId,
    {
      displayName: string
      voiceName: string
    }
  >
  initialServingTeam: TeamId
}

interface PlayersPlusMatchConfiguration {
  mode: 'PLAYERS_PLUS'
  teams: Record<
    TeamId,
    {
      displayName?: string
      voiceName: string
      players: readonly [PlayerParticipant, PlayerParticipant]
    }
  >
  initialServerPlayerId: PlayerId
  initialServiceOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId]
}

type MatchConfiguration =
  PlayerMatchConfiguration | PlayersPlusMatchConfiguration
```

Le brouillon utilise la même union, avec des valeurs éventuellement incomplètes
et un état de validation. Il reste détenu par `MatchController`. Les entrées voix
et clavier appliquent des commandes de modification à ce même brouillon.

### Invariants PLAYER+

- exactement deux équipes et deux joueurs par équipe ;
- quatre identifiants de joueur uniques ;
- un nom non vide pour chaque joueur ;
- exactement un joueur `RIGHT` et un joueur `LEFT` par équipe ;
- une consigne vocale non vide et distincte par équipe ;
- un premier serveur appartenant aux quatre participants ;
- un ordre initial qui contient chaque joueur exactement une fois et alterne les
  équipes ;
- position et ordre de service indépendants.

Les noms d’équipes restent dérivables des joueurs tant qu’aucun nom personnalisé
n’est fourni. Cette valeur dérivée ne devient pas une seconde source de vérité.

## 5. Configuration commune

### Composition de la page

Une seule page `MatchSetup` compose :

- un sélecteur de mode ;
- les champs d’équipe et de consigne communs ;
- en PLAYER, le choix de l’équipe au service ;
- en PLAYER+, les quatre joueurs, leurs positions, l’action « Inverser les
  côtés », le premier serveur et le récapitulatif de rotation ;
- les contrôles voix/clavier communs ;
- un seul bouton « Démarrer le match ».

PLAYER demeure le mode par défaut pendant la migration, afin de préserver le
parcours existant. Le choix définitif du mode présélectionné devra être validé
sur le terrain.

### Voix et clavier

`VoiceMatchSetup` conserve une seule orchestration, mais reçoit une liste
d’étapes adaptée au mode. Les étapes communes réutilisent les mêmes validateurs.
Les étapes PLAYER+ ajoutent les joueurs et le serveur individuel sans ajouter de
question vocale pour les positions : `RIGHT` puis `LEFT` sont les valeurs par
défaut et l’inversion reste visuelle.

Chaque modification transporte la révision du brouillon sur laquelle elle a
commencé. Une réponse vocale antérieure à une saisie clavier plus récente est
ignorée, comme aujourd’hui.

### Changement de mode

Si le brouillon est vide, le changement est immédiat. S’il est modifié, une
confirmation est demandée. Après confirmation :

- le dialogue en cours est arrêté ;
- les résultats vocaux de l’ancienne révision sont invalidés ;
- le brouillon est recréé avec les valeurs par défaut du nouveau mode ;
- aucune conversion n’est tentée ;
- `ExperienceSession` et le Wake Lock restent actifs.

## 6. Politique de service

### Décision

Ne pas introduire immédiatement une hiérarchie de classes `ServicePolicy`.
Une interface polymorphe stockée dans le moteur compliquerait inutilement la
copie des instantanés, l’égalité d’état et les tests.

Utiliser d’abord une union discriminée de données et des fonctions pures :

```ts
type ServiceState =
  | {
      mode: 'PLAYER'
      currentTeam: TeamId
      tieBreakInitialTeam: TeamId | null
    }
  | {
      mode: 'PLAYERS_PLUS'
      setOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId]
      currentServerIndex: number
      tieBreakInitialServerIndex: number | null
    }
```

Des fonctions dédiées répondent aux seules questions métier :

- serveur courant ;
- serveur suivant ;
- avance après un jeu ;
- serveur d’un point de tie-break ;
- correction du serveur ;
- préparation du set suivant.

Si un troisième contrat de service démontre plus tard un vrai polymorphisme, ces
fonctions pourront être placées derrière une interface sans changer leurs
données.

### Source de vérité

`ServiceState` appartient au `MatchState` et à ses instantanés. Les champs
`isServing`, le libellé du serveur et le prochain serveur sont toujours dérivés.
Le booléen applicatif `servingTeamSwapped` disparaît.

Pour PLAYER, cette structure conserve exactement le comportement actuel. Pour
PLAYER+, le cycle d’un set est par exemple `A1 → B1 → A2 → B2` et avance après
chaque jeu.

### Nouveau set

La continuité réglementaire détermine l’équipe du premier jeu du set suivant,
mais chaque équipe peut choisir son ordre interne. Le moteur doit donc exposer un
état explicite d’attente d’ordre du nouveau set, sans faire porter le dialogue au
core. `MatchController` recueille les deux choix puis appelle une opération
typée de reprise. Aucun point ne peut être attribué tant que le nouvel ordre
n’est pas valide.

## 7. Tie-break, correction et undo

### Tie-break PLAYER+

- l’indice courant du cycle fournit le premier serveur ;
- ce joueur sert un point ;
- les joueurs suivants servent deux points chacun ;
- le cycle des quatre joueurs est conservé, y compris après 6-6 ;
- l’équipe qui n’a pas commencé le tie-break ouvre le set suivant ;
- son joueur précis dépend du nouvel ordre interne choisi pour ce set.

Le serveur du prochain point se calcule à partir de l’indice initial du
tie-break et du nombre total de points joués. Il ne dépend jamais de la position
`RIGHT` ou `LEFT`.

### Correction

Une seule opération métier corrige le serveur :

- PLAYER reçoit une équipe ;
- PLAYER+ reçoit un `PlayerId` ;
- le moteur enregistre l’instantané précédent ;
- la correction ré-ancre le cycle sans modifier score, position ou ordre
  interne ;
- en tie-break, elle ré-ancre le serveur du point courant tout en conservant la
  séquence de blocs d’un puis deux services.

Les homonymes sont résolus dans `MatchController` avant l’appel au moteur. Une
réponse ambiguë ne déclenche aucune correction.

### Undo

Parce que l’état de service est inclus dans chaque instantané, `undo()` restaure
en une seule opération :

- un point et son serveur ;
- un jeu et le joueur qui devait servir ;
- un set et son ordre de service ;
- un tie-break et son ancre individuelle ;
- une correction de points ;
- une correction de serveur.

Aucun historique parallèle n’est autorisé dans `MatchController`.

## 8. Page score et annonces

`MatchScreen` reste unique. Les lignes d’équipe, le score, les commandes de
secours, le diagnostic et la structure responsive sont communs.

Un petit modèle de présentation isole la variation :

```ts
interface ServicePresentation {
  currentLabel: string
  nextLabel: string
  currentTeam: TeamId
  currentPlayerId?: PlayerId
  currentPlayerSide?: PlayerSide
  correctionChoices: readonly ServiceChoice[]
}
```

Un composant `ServicePanel` affiche ce modèle. PLAYER montre une équipe ;
PLAYER+ montre le joueur, son équipe et éventuellement sa position si les tests
d’usage confirment que cette information est utile. La position n’est pas
rendue obligatoire dans la première version de la page score.

Les annonces de score existantes restent communes. Un formateur de service
reçoit `ServicePresentation` :

- PLAYER annonce l’équipe ;
- PLAYER+ annonce le joueur ;
- les transitions de jeu, set et tie-break utilisent la même sortie dérivée ;
- aucune règle de score n’est dupliquée dans les annonces.

## 9. Découpage proposé

PLAYER+ reste masqué derrière un garde de disponibilité tant que le parcours
complet n’est pas livré. Les étapes intermédiaires restent néanmoins vérifiables
par tests de contrat et d’intégration, sans afficher un mode partiellement
fonctionnel aux joueurs.

### TASK-016 — Unifier le brouillon de configuration

- introduire le discriminant `mode` avec PLAYER par défaut ;
- adapter la configuration existante sans changer le parcours PLAYER ;
- permettre à voix et clavier d’écrire dans le même brouillon ;
- centraliser validation, copie, révision et reset ;
- ne pas encore rendre PLAYER+ sélectionnable.

Validation intermédiaire : parcours PLAYER vocal, manuel et mixte ; priorité de
la saisie récente ; régression complète du démarrage actuel.

### TASK-017 — Rendre le service PLAYER historisable

- introduire `ServiceState` dans le `MatchState` ;
- adapter le comportement PLAYER à la branche `PLAYER` ;
- déplacer la correction de serveur dans le `ScoreEngine` existant ;
- supprimer `servingTeamSwapped` ;
- vérifier jeu, tie-break, correction et `undo()` sans changement visible.

Validation intermédiaire : égalité stricte entre les états affichés avant et
après refactoring, plus annulation d’une correction de serveur.

### TASK-018 — Ajouter les participants et le service PLAYER+

- ajouter les types joueur, position et ordre de service ;
- valider les invariants PLAYER+ ;
- implémenter la branche `PLAYERS_PLUS` des fonctions pures de service ;
- couvrir jeux, tie-break prolongé, nouveau set, correction et historique ;
- conserver la même classe `ScoreEngine` et les mêmes règles de score.

Validation intermédiaire : tests unitaires et tests de contrat exécutés sur les
deux modes, sans exposition utilisateur de PLAYER+.

### TASK-019 — Connecter la configuration PLAYER+

- rendre le sélecteur disponible ;
- composer les champs des quatre joueurs et les positions ;
- ajouter « Inverser les côtés » ;
- composer les étapes vocales PLAYER+ ;
- recueillir le premier serveur et afficher la rotation ;
- gérer le reset confirmé lors d’un changement de mode ;
- construire le même `ScoreEngine` depuis la configuration validée.

Validation intermédiaire : configuration complète vocale, manuelle et mixte,
démarrage réel d’un match PLAYER+, sans double état métier.

### TASK-020 — Présenter et valider le service individuel

- brancher `ServicePanel` sur le modèle de présentation commun ;
- afficher serveur courant et prochain serveur au bon niveau ;
- adapter la correction manuelle et vocale ;
- adapter les annonces de serveur et transitions ;
- vérifier le responsive téléphone et préparer la campagne terrain ;
- lever le garde de disponibilité PLAYER+ après review.

Validation intermédiaire : match PLAYER+ complet sur téléphone, puis test terrain
centré sur durée de configuration, compréhension du service et utilité perçue.

Cet ordre traite d’abord les sources de vérité et l’historique. Il évite de
construire une interface sur le booléen de correction actuel, qui ne peut pas
supporter proprement quatre joueurs.

## 10. Matrice de tests

| Domaine            | PLAYER                                 | PLAYER+                                         | Commun                                               |
| ------------------ | -------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Configuration      | 2 équipes, consignes, équipe serveur   | 4 joueurs, positions, consignes, joueur serveur | voix, clavier, saisie mixte, révision tardive        |
| Changement de mode | reset depuis PLAYER                    | reset depuis PLAYER+                            | confirmation si brouillon modifié, aucune conversion |
| Validation         | noms et consignes distincts            | 4 joueurs, côtés valides, ordre complet         | bouton désactivé si invalide                         |
| Jeu classique      | alternance A/B                         | cycle A1/B1/A2/B2                               | score identique                                      |
| Jeux prolongés     | serveur inchangé dans le jeu           | joueur inchangé dans le jeu                     | égalité/avantage sans effet sur rotation             |
| Tie-break          | 1 puis 2 services par équipe           | 1 puis 2 services par joueur                    | 6-6, 10-8, correction de points                      |
| Nouveau set        | prochaine équipe dérivée               | prochaine équipe + nouvel ordre interne         | blocage avant ordre valide                           |
| Correction serveur | choix équipe                           | choix joueur, homonyme clarifié                 | score et positions inchangés                         |
| Undo               | point, jeu, set, tie-break, correction | mêmes cas avec joueur et ordre                  | restauration exacte de l’instantané                  |
| Affichage          | équipe courante/suivante               | joueur courant/suivant                          | page et composants communs                           |
| Annonces           | nom d’équipe                           | nom de joueur                                   | score et transitions communs                         |
| Session            | démarrer, finir, nouveau match         | mêmes scénarios                                 | GameSession et ExperienceSession inchangés           |
| Voix               | commandes existantes                   | mêmes commandes + réponses joueur               | ConversationEngine et écoute inchangés               |
| Responsive         | téléphone actuel                       | 4 joueurs sans surcharge                        | lisibilité et contrôles de secours                   |

Chaque Task doit exécuter toute la suite PLAYER. Les tests PLAYER+ s’ajoutent ;
ils ne remplacent jamais les tests historiques.

## 11. Risques et parades

| Risque                               | Parade                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| Duplication PLAYER / PLAYER+         | Union discriminée aux frontières, fonctions et composants communs au centre |
| Conditions de mode dispersées        | Brancher le mode uniquement dans configuration, service et présentation     |
| Deux sources de vérité du serveur    | `ServiceState` dans `MatchState`, sorties toujours dérivées                 |
| Régression PLAYER                    | PLAYER par défaut, tests de contrat et suite historique à chaque Task       |
| `undo()` incohérent                  | État de service dans l’instantané, aucun historique applicatif parallèle    |
| Tie-break incorrect après correction | Ancre individuelle explicite et tests table-driven sur chaque point         |
| Confusion position/service           | Types et validateurs séparés ; aucune dérivation de l’un par l’autre        |
| Configuration trop longue            | Valeurs de côté par défaut, aucune question vocale dédiée, mesure terrain   |
| Voix et clavier divergents           | Un seul brouillon, mêmes commandes de modification et mêmes validateurs     |
| Réponse vocale tardive               | Révision du brouillon conservée lors de chaque étape                        |
| Choix du nouvel ordre trop intrusif  | État explicite entre les sets et test terrain avant enrichissement          |
| PLAYER+ partiel visible              | Garde de disponibilité jusqu’à TASK-020                                     |
| Homonymes de joueurs                 | Résolution exacte, clarification par équipe, blocage des homonymes internes |

## 12. Review et validation

### Review technique avant chaque commit futur

- aucune seconde classe de moteur ou de contrôleur ;
- aucune règle de score dans React, la voix ou les annonces ;
- aucune dépendance navigateur dans `src/core` ;
- aucun état de serveur concurrent ;
- toute mutation du service couverte par `undo()` ;
- diff PLAYER expliqué et couvert ;
- tests, lint, build, format et `git diff --check` réussis.

### Validation produit

Les documents et tests peuvent valider la cohérence de conception. Ils ne
valident pas l’expérience PLAYER+.

La première campagne terrain devra mesurer :

- le temps réel de configuration PLAYER et PLAYER+ ;
- la compréhension du sélecteur ;
- la facilité de renseigner quatre joueurs ;
- l’utilité de la position visible ou invisible ;
- la compréhension du serveur courant et du prochain serveur ;
- la fluidité du choix d’ordre au set suivant ;
- la fréquence et la réussite des corrections ;
- l’envie de réutiliser PLAYER+ plutôt que PLAYER.

Une abstraction supplémentaire, une commande vocale de position, des profils,
des statistiques ou une persistance ne seront envisagés qu’après un problème
réel observé dans cette campagne.
