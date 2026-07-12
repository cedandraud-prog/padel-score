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

## Configuration et connexion

`MatchConfiguration` contient, pour chaque équipe, un nom affiché et un nom vocal distinct, ainsi que le serveur initial. `VoiceMatchSetup` suit le parcours direct nom affiché → nom vocal → test exact et propose des modifications du draft unique détenu par le contrôleur. Toute modification manuelle reste prioritaire ; modifier un nom vocal invalide sa validation. `MatchController` interprète les noms vocaux, tandis que le `ScoreEngine` reçoit seulement les noms affichés.

`ConnectionQualityMonitor` observe indépendamment l’état en ligne, les mesures éventuellement exposées par la Network Information API et les erreurs ou délais remontés par la reconnaissance. Il produit un indice qualitatif sans dépendre du `ConversationEngine` et sans prétendre mesurer le signal Wi-Fi. L’absence de cette API est un état pris en charge.

## Session et format

`GameSession` porte les états `NOT_STARTED`, `IN_PROGRESS` et `FINISHED`. `MatchFormat` est une politique explicite du `ScoreEngine` : `REGULAR_MATCH` applique le meilleur des trois sets, tandis que `FREE_PLAY` poursuit les sets sans vainqueur global. Le MLP utilise `FREE_PLAY` et seule la session décide de la clôture globale.
