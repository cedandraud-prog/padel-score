# Architecture cible

Le projet sépare les responsabilités afin que les règles métier restent indépendantes des technologies d’interface et de voix.

- `core` : règles et moteur de score, sans dépendance à React ;
- `application` : orchestration des cas d’usage ;
- `ui` : affichage et interactions utilisateur ;
- `voice` : reconnaissance et synthèse vocales.

Chaque composant matériel ou logiciel devra pouvoir être remplacé indépendamment. Les dépendances entre couches seront introduites uniquement lorsqu’un cas d’usage validé le nécessitera.

## Conversation Engine

`ConversationEngine` orchestre les tours système/joueur, les modes `MATCH` et `GUIDED`, la disponibilité de l’écoute, le timeout et le bip de disponibilité. Il reçoit des événements conversationnels et produit des intentions indépendantes des adaptateurs.

`MatchController` traduit ces intentions vers la reconnaissance, la synthèse et le bip, puis reste seul responsable des commandes métier et du `ScoreEngine`. Le moteur conversationnel ne dépend ni de React, ni du navigateur, ni des règles du padel.

Aucun backend ni mécanisme de persistance n’est implémenté.
