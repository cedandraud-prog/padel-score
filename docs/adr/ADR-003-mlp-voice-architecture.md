# ADR-003 — Architecture vocale du MLP

## Statut

Accepted

## Applicabilité

Cette décision s’applique uniquement au MLP utilisé pour valider l’expérience de comptage vocal sur le terrain.

Elle n’engage pas l’architecture des produits PADEL SCORE GO et PADEL SCORE CLUB.

## Décision

- Le navigateur cible du MLP est Google Chrome sur Windows.
- La reconnaissance vocale utilise `SpeechRecognition` ou `webkitSpeechRecognition`.
- Les annonces utilisent `speechSynthesis`.
- Toute dépendance à la Web Speech API reste confinée dans la couche `voice`.
- La couche `voice` reste remplaçable sans modifier le moteur de score.
- La reconnaissance est arrêtée pendant chaque synthèse vocale, puis relancée si l’écoute est toujours souhaitée et si le match continue.
- Le vocabulaire est volontairement limité.
- Les commandes et noms d’équipes utilisent une correspondance exacte après normalisation conservatrice.
- Une transcription de confiance exploitable inférieure à `0.65` est ignorée. Une valeur absente, non finie ou égale à zéro est considérée comme non exploitable et laisse uniquement la correspondance exacte décider.
- Les boutons et formulaires PC sont conservés comme facilitateurs de test, de correction et de diagnostic.

## Conséquences

Le MLP dépend des capacités et autorisations du navigateur pour la voix. En leur absence, le match reste utilisable manuellement.

Cette architecture sert à tester une hypothèse d’usage avec un coût minimal. Elle ne constitue pas un choix matériel ou logiciel pour les versions commerciales.
