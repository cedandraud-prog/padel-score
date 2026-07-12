# ADR-006 — Séparer la session de jeu du format de match

## Statut

Accepted

## Applicabilité

- MLP : oui ;
- GO : oui ;
- CLUB : oui.

## Contexte

La durée réellement disponible sur un terrain ne permet pas toujours de terminer un match réglementaire. Une réservation peut ainsi prendre fin sur un score tel que `6-2 / 2-6 / 3-5`.

Le score sportif, la période effectivement jouée et la politique déterminant la fin d’un match sont donc trois concepts distincts.

## Décision

### Session de jeu

Une session de jeu représente la période réellement jouée sur le terrain. Elle possède l’un des états suivants :

- `NOT_STARTED` ;
- `IN_PROGRESS` ;
- `FINISHED`.

La fin d’une session ne signifie pas nécessairement qu’un format réglementaire a désigné un vainqueur.

### Mode Jeu libre

Le mode actif du MLP est `FREE_PLAY`, présenté à l’utilisateur comme « Jeu libre ».

Dans ce mode :

- les règles de calcul des points, jeux, sets et tie-break restent appliquées ;
- aucune limite de sets n’arrête automatiquement la session ;
- la session peut être terminée manuellement à tout moment ;
- un set en cours reste affiché et conservé ;
- aucun abandon n’est enregistré ;
- aucun vainqueur réglementaire global n’est imposé.

### Commande « Fin de match »

La commande « Fin de match » est disponible uniquement lorsque la session est `IN_PROGRESS`.

Elle ouvre le dialogue suivant :

> Utilisateur : « Fin de match »  
> Système : « Confirmer la fin du match ? »

Les réponses autorisées sont :

- « Confirmer » : clôturer la session au score courant ;
- « Annuler » : reprendre la session sans modification.

Après confirmation, le système :

- conserve exactement les points, jeux et sets ;
- passe la session à `FINISHED` ;
- arrête l’écoute des commandes de score ;
- annonce le score final ;
- affiche « Session terminée ».

### Score final

En Jeu libre, le score final peut être incomplet au regard d’un format réglementaire. Par exemple :

- set 1 : `6-2` ;
- set 2 : `2-6` ;
- set courant : `3-5`.

L’annonce reste factuelle et sobre :

> « Fin du match. Un set partout. Cinq jeux à trois pour &lt;équipe&gt; dans le set en cours. »

Le système ne déclare pas automatiquement de vainqueur global lorsque le format ne permet pas d’en déterminer un.

### Commande « Nouveau match »

La commande « Nouveau match » :

- est refusée pendant une session `IN_PROGRESS` ;
- est autorisée après une session `FINISHED` ;
- ramène à la configuration du prochain match ;
- ne conserve aucun score précédent.

La possibilité de proposer la réutilisation d’une configuration est hors périmètre de cette décision.

### Formats futurs

L’architecture prévoit conceptuellement les formats suivants :

- `FREE_PLAY` ;
- `REGULAR_MATCH` ;
- `TOURNAMENT`.

Les règles précises de `REGULAR_MATCH` et `TOURNAMENT` ne sont pas définies aujourd’hui.

## Architecture

Les responsabilités sont séparées ainsi :

- `ScoreEngine` calcule les points, jeux, sets et tie-break ;
- `GameSession` porte le cycle de vie de la période réellement jouée ;
- `MatchFormat` porte la politique qui peut éventuellement déterminer une fin automatique.

Le `ScoreEngine` ne doit plus être considéré comme seul responsable de la fin de la session. Une victoire calculée selon certaines règles de score et la clôture effective de la session deviennent deux informations distinctes.

L’API du moteur reçoit explicitement `format: 'FREE_PLAY' | 'REGULAR_MATCH'`. `REGULAR_MATCH` reste la valeur par défaut afin de préserver le comportement historique. Le MLP injecte `FREE_PLAY`, qui ne produit aucun vainqueur global et laisse les sets s’accumuler jusqu’à la clôture de `GameSession`.

## Conséquences

- le MLP devra explicitement créer et clôturer une `GameSession` ;
- le mode Jeu libre devra pouvoir continuer au-delà d’un nombre réglementaire de sets ;
- une clôture manuelle devra figer une photographie exacte du score courant sans transformer le set en cours ;
- les commandes disponibles dépendront de l’état de la session ;
- les annonces devront distinguer un score final de session d’un vainqueur réglementaire ;
- les futurs formats pourront introduire leur politique de fin sans modifier les règles élémentaires de calcul du score.

## Questions ouvertes

- Quelle représentation exacte utilisera `MatchFormat` dans le code ?
- Une session terminée pourra-t-elle être rouverte après une erreur de confirmation ?
- Comment présenter visuellement un set inachevé sur le tableau final ?
- Quelle formulation employer lorsque les équipes sont à égalité dans le set en cours ?
- Comment les formats `REGULAR_MATCH` et `TOURNAMENT` détermineront-ils leur fin automatique ?
- Quand et comment proposer la réutilisation de la configuration précédente ?
- Une future persistance conservera-t-elle uniquement le score final ou également l’historique complet de la session ?
