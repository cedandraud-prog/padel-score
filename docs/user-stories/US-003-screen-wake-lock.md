# US-003 — Maintien de l’écran actif

## Problème observé

Lors d’un match réel sur téléphone Android, l’écran peut s’éteindre après le délai de veille. L’application risque alors de passer en arrière-plan et la reconnaissance vocale peut être interrompue. Le joueur doit intervenir manuellement, ce qui rend l’expérience inutilisable sur le terrain.

## User Story

En tant que joueur utilisant PADEL SCORE pendant un match, je veux que mon téléphone reste éveillé tant que la session est en cours afin de continuer à jouer sans toucher l’écran.

## Comportement cible

- Aucun verrou d’écran n’est demandé pendant la configuration.
- Le démarrage effectif d’une session demande un verrou d’écran natif.
- Un seul verrou peut être actif ou en cours d’acquisition.
- La fin de session, le retour à l’accueil et le démontage de l’application libèrent le verrou.
- Si le navigateur libère automatiquement le verrou en arrière-plan, l’application en demande un nouveau lorsqu’elle redevient visible et que la session est toujours en cours.
- Un échec d’acquisition ne bloque jamais le match.

## Limites navigateur

La Screen Wake Lock API dépend du navigateur, du contexte sécurisé et des décisions du système. Le verrou peut être refusé ou libéré automatiquement, notamment lorsque l’application n’est plus visible ou selon les réglages d’économie d’énergie.

## Fallback utilisateur

Lorsque l’API est indisponible ou que l’acquisition échoue, l’application affiche un avertissement discret :

> Votre téléphone peut se mettre en veille pendant le match. Vérifiez temporairement les réglages d’écran pour éviter une interruption.

Le joueur peut masquer cet avertissement. Le message disparaît également si un verrou est obtenu ultérieurement.

## Critères d’acceptation

1. Un verrou `screen` est demandé uniquement lorsque la session passe à `IN_PROGRESS`.
2. Le verrou reste référencé tant que la session est active.
3. Le verrou est explicitement libéré à la fin de la session, au retour à l’accueil et au démontage.
4. Une perte automatique est détectée et donne lieu à une nouvelle demande au retour au premier plan.
5. Plusieurs demandes simultanées ne peuvent pas créer plusieurs verrous.
6. L’indisponibilité ou l’échec de l’API n’empêche ni le démarrage ni le déroulement du match.
7. Aucun détail technique n’est présenté au joueur.
8. L’application reste utilisable sur un navigateur non compatible.
