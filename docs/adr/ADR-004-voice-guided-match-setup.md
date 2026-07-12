# ADR-004 — Configuration vocale guidée du match

## Statut

Accepted — amendée par TASK-007.1

## Décision

Chaque équipe possède deux noms distincts :

- un `displayName`, libre et visible sur le tableau ;
- un `voiceName`, court et utilisé comme commande vocale.

Aucun nom vocal n’est proposé par défaut. Le parcours guidé demande directement, pour chaque équipe : nom affiché → nom vocal → test vocal exact. Il ne comporte ni proposition `Alpha` / `Bravo`, ni choix `Conserver` / `Modifier`.

Le nom vocal est validé uniquement lorsque la transcription finale normalisée de l’unique tentative de test correspond exactement au candidat normalisé. Un échec affiche la transcription entendue, conserve le nom affiché et revient directement à la saisie d’un autre nom vocal.

Les noms vocaux doivent être non vides, différents après normalisation, comporter au maximum trois mots et ne pas correspondre aux commandes réservées. Aucun rapprochement approximatif n’est utilisé et le niveau de confiance ne constitue pas une validation.

Le formulaire reste la source de vérité. Une modification manuelle est immédiatement prioritaire et une modification de `voiceName` invalide sa validation précédente. Les deux noms vocaux doivent être validés avant le démarrage.

## Pourquoi

Le retour utilisateur de TASK-007 montre qu’un nom affiché libre peut être difficile à reconnaître sur le terrain. Un nom vocal distinct reste utile, mais son choix doit être direct afin de ne pas réintroduire la longueur du parcours initial.

## Architecture

Le dialogue et la validation exacte restent dans la couche `application`. `MatchController` utilise `voiceName` pour attribuer les points. Le `ScoreEngine` reçoit uniquement `displayName` et le serveur initial ; il ne connaît ni la reconnaissance vocale ni le parcours de configuration.

Le bip de disponibilité reste distinct du feedback optionnel des commandes. Il est émis après la synthèse, uniquement lorsque l’événement réel `onstart` confirme que l’écoute utile a repris.

## Conséquences

- le formulaire PC comporte quatre champs : deux noms affichés et deux noms vocaux ;
- chaque nom vocal doit réussir un test exact ;
- le choix du serveur intervient après validation des deux équipes ;
- l’indice de connexion introduit par TASK-007 reste inchangé ;
- le moteur de score reste indépendant.
