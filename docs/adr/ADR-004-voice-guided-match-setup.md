# ADR-004 — Configuration vocale guidée du match

## Statut

Accepted

## Décision

La configuration d’un match peut être réalisée soit avec le formulaire PC, soit avec un dialogue vocal guidé lancé explicitement depuis le PC.

Chaque équipe possède deux informations distinctes :

- un nom d’affichage, visible sur le tableau de score ;
- un identifiant vocal, utilisé pour attribuer les points.

Les identifiants proposés par défaut sont `Alpha` et `Bravo`. Ils peuvent être remplacés. Les deux parcours produisent le même objet `MatchConfiguration`.

Pendant la configuration, le contrôleur conserve un unique `MatchConfiguration` en cours d’édition. Le formulaire est contrôlé par cet objet et toute valeur acceptée par le dialogue le met immédiatement à jour. Une modification manuelle est synchronisée vers la machine de dialogue avant la transcription suivante ; elle constitue donc la valeur courante et n’est pas écrasée par une copie vocale obsolète.

Le draft possède une révision interne. Chaque session de reconnaissance capture cette révision ; une transcription provenant d’une session antérieure à une modification manuelle est ignorée. Au démarrage vocal, le contrôleur valide et utilise une copie du draft courant, jamais une ancienne configuration conservée par le dialogue.

## Pourquoi

Les noms choisis pour être lus sur un tableau ne sont pas toujours les plus fiables à reconnaître dans le bruit d’un terrain. Des identifiants courts et distincts permettent de tester une configuration naturelle sans coupler le moteur de score à la reconnaissance vocale.

## Architecture

Le dialogue est orchestré dans la couche `application`. Le contrôleur associe ensuite chaque identifiant vocal à l’équipe A ou B. Le `ScoreEngine` reçoit uniquement les noms d’affichage et le serveur initial.

La reconnaissance reste exacte après normalisation. Aucun rapprochement approximatif n’est introduit.

## Conséquences

- le formulaire PC comporte quatre champs : deux noms affichés et deux identifiants vocaux ;
- le parcours vocal demande les noms, propose les identifiants, demande le serveur puis une confirmation ;
- les commandes réservées ne peuvent pas devenir des identifiants ;
- une réponse invalide conserve l’étape courante et provoque une nouvelle demande ;
- le moteur de score reste inchangé et remplaçable indépendamment.

Le dialogue utilise un bip de disponibilité distinct du feedback optionnel des commandes. Il est émis seulement après la fin d’une instruction, lorsque l’écoute a effectivement repris et qu’une réponse est attendue. Le choix d’un identifiant est formulé « Conserver ou Modifier » ; `Modifier` ouvre silencieusement la fenêtre de saisie personnalisée, signalée par ce bip.
