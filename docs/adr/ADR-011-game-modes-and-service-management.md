# ADR-011 — Modes PLAYER / PLAYER+ et gestion du service

## Statut

Accepted — amendée par ADR-011.1 le 2026-07-13.

## Contexte

Les premiers tests terrain font apparaître deux attentes légitimes : commencer
presque immédiatement ou identifier les quatre participants afin de suivre
précisément le service. Ces attentes deviennent deux contrats explicites :

- **PLAYER** : démarrage rapide avec gestion du score et du service au niveau
  des équipes ;
- **PLAYER+** : expérience enrichie avec quatre joueurs, positions et rotation
  individuelle du service.

Cette décision concerne le vertical padel. Elle ne généralise pas ces règles à
d'autres sports.

## Décision

Le mode est choisi avant de renseigner la configuration. La voix reste l'entrée
principale, mais chaque question accepte aussi une réponse au clavier. Toutes les
entrées modifient le même brouillon.

Le bouton « Démarrer le match » est disponible dans les deux modes et reste
désactivé tant que les informations obligatoires sont incomplètes ou invalides.

## Comparaison

|                     | PLAYER                            | PLAYER+                              |
| ------------------- | --------------------------------- | ------------------------------------ |
| Objectif            | Commencer en moins de 30 secondes | Suivre joueurs, positions et service |
| Participants connus | Deux équipes                      | Quatre joueurs                       |
| Positions connues   | Aucune                            | Droite ou gauche pour chaque joueur  |
| Consigne vocale     | Une par équipe                    | Une par équipe                       |
| Serveur             | Équipe                            | Joueur                               |
| Rotation            | Alternance des équipes            | Cycle individuel des quatre joueurs  |
| Tie-break           | Suivi au niveau des équipes       | Ordre individuel officiel            |
| Prochain serveur    | Équipe                            | Joueur                               |
| Configuration       | Voix ou clavier                   | Voix ou clavier                      |

PLAYER protège la simplicité et la découverte immédiate. PLAYER+ apporte une
précision utile, mais aussi davantage de configuration, d'ambiguïtés possibles
et d'interactions. L'imposer ferait supporter cette complexité à tous les
joueurs. Enrichir progressivement PLAYER créerait un contrat variable et
difficile à comprendre. Les deux modes restent donc séparés.

## Mode PLAYER

### Périmètre

PLAYER connaît strictement :

- deux équipes ;
- un nom affiché par équipe ;
- une consigne vocale par équipe ;
- l'équipe qui sert.

Il ne connaît aucun joueur individuel et aucune position droite ou gauche. Une
consigne vocale attribue un point à son équipe.

### Service

- le serveur courant et le prochain serveur sont des équipes ;
- le service change d'équipe après chaque jeu ;
- une correction sélectionne l'équipe actuellement au service ;
- elle ne modifie pas le score et ré-ancre l'alternance ;
- son annulation restaure l'état précédent.

Les joueurs restent responsables de leur ordre interne. PLAYER ne prétend jamais
connaître ou annoncer le serveur individuel.

### Tie-break

PLAYER suit l'alternance des équipes :

1. l'équipe prévue sert le premier point ;
2. l'équipe adverse sert les deux points suivants ;
3. les équipes servent ensuite deux points consécutifs à tour de rôle ;
4. le set suivant commence avec l'équipe qui n'a pas commencé à servir dans le
   tie-break.

Le score et l'alternance des paires restent conformes, tandis que l'ordre
individuel demeure sous la responsabilité des joueurs.

## Mode PLAYER+

### Périmètre

PLAYER+ connaît :

- deux équipes ;
- exactement deux joueurs par équipe ;
- une consigne vocale par équipe ;
- la position de chaque joueur ;
- le premier joueur serveur ;
- l'ordre individuel du service.

Le nom affiché par défaut d'une équipe est composé des deux joueurs, par exemple
`Cédric / Julien`. Un nom personnalisé peut remplacer cet affichage sans modifier
les joueurs, la consigne, les positions ou l'ordre de service.

### Position des joueurs

Chaque joueur possède une position dans le contexte du match :

- `RIGHT` : droite ;
- `LEFT` : gauche.

Chaque équipe possède exactement un joueur à droite et un joueur à gauche. Deux
joueurs d'une même équipe ne peuvent jamais partager la même position.

La position n'est pas une préférence permanente de profil. Elle peut être
différente lors d'un autre match. Elle prépare notamment :

- l'affichage du terrain ;
- les statistiques droite/gauche ;
- la compréhension visuelle des équipes ;
- les futures expériences club, écran et profils joueurs.

La position ne détermine ni les points, ni l'ordre des équipes, ni la rotation du
service, ni l'issue du match.

### Configuration des positions

Aucune question vocale systématique n'est ajoutée :

- le premier joueur saisi est à droite par défaut ;
- le second joueur saisi est à gauche par défaut ;
- la configuration visuelle propose « Inverser les côtés » ;
- la saisie manuelle permet de choisir explicitement les positions.

Inverser les côtés échange uniquement `RIGHT` et `LEFT`. Les noms, les consignes
vocales et le premier serveur éventuellement choisi restent inchangés.

La voix n'est pas le parcours principal pour cette donnée. Une éventuelle
commande vocale de position nécessitera une décision séparée.

Pendant le match, aucun changement libre de position n'est prévu. La position de
jeu ne doit pas être confondue avec un changement de côté physique sur le terrain.

### Ordre initial du service

L'ordre de saisie définit l'ordre interne proposé pour le premier set :

- le joueur 1 est le premier serveur interne proposé ;
- le joueur 2 est le suivant ;
- si le premier serveur global choisi est le joueur 2 de son équipe, l'ordre de
  cette équipe est inversé ;
- l'équipe adverse conserve son ordre de saisie ;
- le récapitulatif expose la rotation complète avant le démarrage.

### Rotation

Chaque set possède un ordre interne immuable pour chaque équipe et une équipe qui
sert le premier jeu. Ces informations forment un cycle, par exemple :

```text
A1 → B1 → A2 → B2 → A1…
```

Après chaque jeu, le service avance d'une position. Lorsqu'une équipe retrouve
le service, son autre joueur sert.

La position droite ou gauche n'intervient pas dans le cycle. Un joueur placé à
gauche peut être le premier serveur de son équipe.

Au début du set suivant, chaque équipe peut choisir un nouvel ordre interne.
L'équipe qui sert le premier jeu reste déterminée par la continuité réglementaire.

### Correction

La commande « Serveur » demande « Quel joueur sert ? ». La correction manuelle
et la correction vocale utilisent le même cas d'usage.

La correction :

- sélectionne un joueur précis ;
- positionne le cycle sur ce joueur ;
- conserve l'ordre interne du set ;
- ne modifie ni points, ni jeux, ni sets ;
- ne modifie aucune position ;
- peut être annulée pour restaurer exactement l'état précédent.

### Homonymes

- une correspondance normalisée unique sélectionne le joueur ;
- un homonyme dans l'autre équipe déclenche une clarification par équipe ;
- deux homonymes dans la même équipe bloquent le démarrage jusqu'à distinction ;
- aucun fuzzy matching général n'est utilisé.

### Tie-break

Conformément aux [Rules of Padel de la FIP](https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel.pdf) :

1. le joueur prévu par l'ordre du set sert le premier point ;
2. il ne sert qu'un point ;
3. les joueurs suivants servent deux points chacun ;
4. le cycle des quatre joueurs reste respecté jusqu'à la fin ;
5. le set suivant commence avec un joueur de la paire qui n'a pas commencé à
   servir dans le tie-break ;
6. chaque paire peut choisir un nouvel ordre interne pour ce nouveau set.

Les positions restent inchangées pendant le tie-break et ne modifient jamais la
rotation. Une correction ou `undo()` restaure le joueur serveur sans le déduire
de sa position.

## Changement de mode

Changer entre PLAYER et PLAYER+ :

- remet à zéro le brouillon complet ;
- efface noms, joueurs, consignes, positions et serveur provisoire ;
- ne convertit aucune valeur automatiquement ;
- revient à la première question du nouveau mode ;
- conserve l'`ExperienceSession` et le Wake Lock actifs.

Le mode ne peut pas être changé pendant une session en cours.

## Saisie vocale et manuelle

- voix et clavier écrivent dans un unique `MatchConfigurationDraft` ;
- la dernière modification valide est prioritaire ;
- une transcription tardive ne peut pas écraser une saisie manuelle plus récente ;
- les mêmes validations s'appliquent aux deux entrées ;
- le bouton de démarrage relit uniquement le brouillon visible ;
- la voix peut toujours mener seule au démarrage, hors inversion facultative des
  positions.

La saisie clavier ne crée pas un deuxième parcours métier.

## Modèle métier proposé

```ts
type GameMode = 'PLAYER' | 'PLAYERS_PLUS'
type PlayerSide = 'RIGHT' | 'LEFT'

interface Player {
  id: PlayerId
  displayName: string
  teamId: TeamId
  side: PlayerSide
}

interface PlayerMatchConfiguration {
  mode: 'PLAYER'
  teams: Record<TeamId, PlayerTeam>
  initialServingTeam: TeamId
}

interface PlayersPlusMatchConfiguration {
  mode: 'PLAYERS_PLUS'
  teams: Record<TeamId, PlayersPlusTeam>
  initialServerPlayerId: PlayerId
  initialServiceOrder: PlayerServiceOrder
}

type MatchConfiguration =
  PlayerMatchConfiguration | PlayersPlusMatchConfiguration
```

`PlayerTeam` possède un nom et une consigne. `PlayersPlusTeam` possède exactement
deux joueurs, une consigne et éventuellement un nom personnalisé. Son invariant
garantit une position `RIGHT` et une position `LEFT`.

Le moteur cible utilise `TeamServiceOrder` en PLAYER et `PlayerServiceOrder` en
PLAYER+. Le serveur courant et le prochain serveur sont dérivés de cette
politique, sans source de vérité concurrente. La position reste une information
complémentaire indépendante.

## Migration

Aucune persistance durable des matchs n'existe. Aucune migration n'est nécessaire
et aucun faux joueur n'est créé à partir d'un ancien nom d'équipe.

## Conséquences

- `MatchConfiguration` devient une union discriminée par mode ;
- PLAYER conserve la gestion actuelle par équipe ;
- PLAYER+ ajoute joueurs, positions et rotation individuelle ;
- la configuration et la page score s'adaptent au mode ;
- les annonces nomment une équipe en PLAYER et un joueur en PLAYER+ ;
- les tests de service devront couvrir les deux politiques ;
- les statistiques individuelles et par position restent hors implémentation.

## Questions ouvertes

- PLAYER ou PLAYER+ doit-il être présélectionné au premier lancement ?
- Quels libellés et descriptions doivent apparaître dans le sélecteur ?
- Une modification des positions pendant un match apporte-t-elle une valeur
  terrain suffisante ?
- Les positions doivent-elles apparaître sur la page score ?
- Comment représenter droite et gauche sur un écran distant ?
- Un futur profil doit-il mémoriser une position préférée ?
- Comment choisir un nouvel ordre de service au début d'un set sans casser le
  rythme ?
- Comment gérer le remplacement d'un joueur ?

## Hors périmètre

- implémentation technique ;
- statistiques individuelles ou par position ;
- persistance ;
- remplaçants ;
- commande vocale de position ;
- changement libre de position pendant le match ;
- conversion automatique entre modes ;
- généralisation multisport.
