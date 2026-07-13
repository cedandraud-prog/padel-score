# Architecture cible

Le projet sépare les responsabilités afin que les règles métier restent indépendantes des technologies d’interface et de voix.

- `core` : règles et moteur de score, sans dépendance à React ;
- `application` : orchestration des cas d’usage ;
- `ui` : affichage et interactions utilisateur ;
- `voice` : reconnaissance et synthèse vocales.

Chaque composant matériel ou logiciel devra pouvoir être remplacé indépendamment. Les dépendances entre couches seront introduites uniquement lorsqu’un cas d’usage validé le nécessitera.

Les périphériques sont des adaptateurs interchangeables autour du cœur logiciel. Le domaine et les cas d’usage ne dépendent ni d’un téléphone, ni d’un microphone, ni d’un haut-parleur, ni d’un casque, ni d’une montre, ni d’un terrain équipé. Les capacités disponibles sont exposées au système par des interfaces indépendantes de leur implémentation.

Cette contrainte est formalisée dans [ADR-008 — L’expérience prime sur le matériel](adr/ADR-008-experience-over-hardware.md).

## Architecture produit multisport cible

L’architecture cible distingue quatre ensembles sans prétendre qu’ils sont déjà implémentés :

- **noyau commun potentiel** : session, participants, événements, historique, correction, commandes, sorties et synchronisation dont les invariants auront été observés dans plusieurs sports ;
- **définition de sport** : modèle de participants, règles de score, états, événements, victoire, correction, vocabulaire et configuration propres à un sport ;
- **expérience verticale** : marque, promesse, interface, parcours et fonctions spécialisées d’un produit tel que PADEL SCORE ;
- **adaptateurs matériels** : périphériques et capacités disponibles, indépendants des règles sportives.

Dans le cœur cible, les notions `15`, `30`, `40`, jeu, set et tie-break ne sont pas universelles : elles appartiennent aux définitions des sports concernés.

Cette séparation reste conceptuelle tant que le padel n’a pas été consolidé et comparé à une définition complète du tennis. Le `ScoreEngine` actuel n’est pas généralisé pour simuler des invariants encore non démontrés.

Voir [ADR-010 — Architecture produit multisport](adr/ADR-010-multisport-product-architecture.md) et le [modèle conceptuel d’une définition de sport](SPORT_DEFINITION_MODEL.md).

## Conversation Engine

`ConversationEngine` orchestre les tours système/joueur, les modes `MATCH` et `GUIDED`, la disponibilité de l’écoute, le timeout et le bip de disponibilité. Il reçoit des événements conversationnels et produit des intentions indépendantes des adaptateurs.

`MatchController` traduit ces intentions vers la reconnaissance, la synthèse et le bip, puis reste seul responsable des commandes métier et du `ScoreEngine`. Le moteur conversationnel ne dépend ni de React, ni du navigateur, ni des règles du padel.

Aucun backend ni mécanisme de persistance n’est implémenté.

## Configuration et connexion

La configuration cible distingue deux contrats explicites : `PLAYER`, qui
connaît deux équipes et un serveur au niveau de l'équipe, et `PLAYERS_PLUS`, qui
connaît quatre joueurs, leurs positions et un serveur individuel.
`MatchConfiguration` devient une union discriminée par ce mode.

La voix reste l'entrée principale, mais chaque question accepte aussi une saisie
clavier. Les deux entrées alimentent un unique `MatchConfigurationDraft` détenu
par le contrôleur. La modification valide la plus récente est prioritaire et une
transcription tardive ne peut pas écraser une saisie manuelle plus récente.

En `PLAYERS_PLUS`, chaque joueur possède une position `RIGHT` ou `LEFT` dans le
contexte du match et chaque équipe possède exactement une position de chaque
type. La position reste indépendante de l'ordre de service.

Le moteur utilise une politique de service adaptée au mode : alternance des
équipes pour `PLAYER`, cycle individuel des quatre joueurs pour `PLAYERS_PLUS`. Le
serveur courant et le prochain serveur sont dérivés de cette politique plutôt
que stockés comme des sources de vérité indépendantes.

Voir [ADR-011 — Modes de jeu et gestion du service](adr/ADR-011-game-modes-and-service-management.md).

`ConnectionQualityMonitor` observe indépendamment l’état en ligne, les mesures éventuellement exposées par la Network Information API et les erreurs ou délais remontés par la reconnaissance. Il produit un indice qualitatif sans dépendre du `ConversationEngine` et sans prétendre mesurer le signal Wi-Fi. L’absence de cette API est un état pris en charge.

## Session et format

`GameSession` porte les états `NOT_STARTED`, `IN_PROGRESS` et `FINISHED`. `MatchFormat` est une politique explicite du `ScoreEngine` : `REGULAR_MATCH` applique le meilleur des trois sets, tandis que `FREE_PLAY` poursuit les sets sans vainqueur global. Le MLP utilise `FREE_PLAY` et seule la session décide de la clôture globale.
