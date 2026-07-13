# US-004 — Écoute vocale fonctionnellement continue

## Problème observé

Pendant un match sur Android Chrome, le service de reconnaissance vocale peut terminer une session technique après quelques secondes, même lorsque l’écoute continue est demandée. Le microphone semble alors s’activer et se désactiver régulièrement, ce qui donne l’impression que PADEL SCORE n’écoute plus de façon fiable.

## User Story

En tant que scoreur, je veux que PADEL SCORE reste fonctionnellement à l’écoute pendant toute la phase où mes commandes sont attendues afin de ne pas avoir à surveiller ou relancer le microphone.

## Limite de la Web Speech API

`continuous = true` décrit le mode demandé au service de reconnaissance, mais ne garantit pas qu’une même session technique restera ouverte indéfiniment. Le navigateur ou son service de reconnaissance peut produire `end` lorsqu’il se déconnecte.

PADEL SCORE distingue donc :

- **l’intention fonctionnelle d’écoute** : le produit attend toujours une commande ;
- **la session technique** : une instance de reconnaissance actuellement active ou en cours de démarrage ;
- **la relance technique** : remplacement discret d’une session terminée sans changer le contexte utilisateur.

## Stratégies comparées

### LEGACY

La stratégie historique expose le cycle naturel de Chrome : une session terminée est relancée immédiatement et l’état technique peut redevenir perceptible. Elle reste disponible comme référence de comparaison terrain.

### CONTINUOUS

La stratégie continue masque les remplacements de sessions, conserve l’état fonctionnel d’écoute et temporise progressivement les échecs. Elle est utilisée par défaut.

Elle ne supprime pas le son système éventuellement produit par Chrome Android lors de la création d’une nouvelle session de reconnaissance. Les essais terrain montrent que ce son disparaît en mode silencieux et revient lorsque le volume système est actif : il provient vraisemblablement de Chrome ou d’Android, pas de PADEL SCORE.

Le mode `CONTINUOUS` masque uniquement les changements d’état visuels et maintient l’intention fonctionnelle d’écoute. Il ne promet pas une session Web Speech unique ni la suppression du bip système.

Le choix est réservé au diagnostic développeur et mémorisé localement. Il ne modifie ni les commandes ni les règles du match.

## Comportement cible

- L’indicateur reste « Écoute active » entre deux sessions techniques.
- Une fin technique inattendue déclenche une relance courte et contrôlée.
- Une seule session peut être active ou en démarrage.
- Une relance technique ne joue aucun son applicatif : ni bip de disponibilité, ni feedback de commande, ni annonce. Un éventuel bip Chrome ou Android reste hors du contrôle de l’application web.
- Le contexte conversationnel, la configuration et le score courant sont conservés.
- Un arrêt fonctionnel annule les timers et interdit toute relance.

## Erreurs récupérables

Sont traitées comme récupérables :

- une fin normale ou inattendue de session ;
- `no-speech` ;
- une interruption temporaire ;
- `InvalidStateError` pendant une tentative concurrente évitée ;
- une erreur réseau ponctuelle.

Ces situations conservent l’intention d’écoute. Les relances utilisent une temporisation progressive plafonnée afin d’éviter une boucle agressive.

## Erreurs nécessitant une action utilisateur

Les relances s’arrêtent lorsque :

- la permission microphone est refusée ;
- aucun microphone n’est disponible ;
- l’API n’est pas supportée ;
- une erreur inconnue empêche le démarrage ;
- trois erreurs réseau consécutives indiquent un problème persistant.

Un message compréhensible est affiché. Le score reste consultable et les commandes de secours restent utilisables.

## Arrêts fonctionnels

L’écoute fonctionnelle s’arrête lors :

- d’une désactivation volontaire ;
- du retour à l’accueil ;
- de la fin ou de l’annulation du parcours concerné ;
- d’une étape système qui ne doit pas écouter ;
- d’une erreur non récupérable ;
- du démontage de l’application.

## Critères d’acceptation

1. `onend` inattendu planifie une seule relance lorsque l’écoute est attendue.
2. L’interface ne passe pas par un état inactif pendant cette relance.
3. Aucun bip de disponibilité n’est rejoué lors d’une relance technique.
4. Aucun `start()` concurrent n’est produit.
5. Les échecs récupérables utilisent une temporisation progressive.
6. Un arrêt explicite ou une erreur non récupérable annule toute relance.
7. Les timers sont nettoyés au démontage.
8. La configuration, le dialogue et le score restent inchangés entre deux sessions techniques.
9. Aucune règle de score n’est modifiée.
10. Le diagnostic distingue la stratégie active et affiche les sessions créées, terminées, relancées, les erreurs et la dernière erreur.

## Protocole de comparaison terrain

1. Réaliser une séquence comparable en `LEGACY`, puis en `CONTINUOUS` sur le même téléphone et le même réseau.
2. Remettre les compteurs à zéro avant chaque séquence.
3. Observer le nombre de sessions créées, fins, relances, erreurs et commandes reconnues ou perdues.
4. Noter séparément les alternances visuelles du microphone et les interventions manuelles nécessaires.
5. Comparer les résultats sans modifier les noms vocaux ni les conditions réseau entre les deux essais.
