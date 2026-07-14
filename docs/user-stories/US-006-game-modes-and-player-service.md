# US-006 — Modes PLAYER / PLAYER+ et service

## Statut

Partiellement réalisée — ADR-011 Accepted.

La configuration commune et le service PLAYER historisé sont validés
techniquement et sur la Preview PWA. PLAYER+ est sélectionnable et configurable,
mais son démarrage, sa rotation individuelle et sa connexion au moteur ne sont
pas encore implémentés. Le contrat pur des participants et de l’ordre progressif
du premier set est validé avec TASK-018.1.

## User Story principale

En tant que joueur, je veux choisir entre PLAYER et PLAYER+ afin d'utiliser
PADEL SCORE avec le niveau de détail adapté à mon match.

## PLAYER

En tant que joueur, je veux configurer deux équipes et l'équipe au service afin
de commencer rapidement sans renseigner les participants.

PLAYER connaît uniquement :

- deux noms d'équipes ;
- deux consignes vocales ;
- l'équipe qui sert.

Il ne connaît aucun joueur, aucune position et aucun serveur individuel. Le
service et le tie-break restent suivis au niveau des équipes.

## PLAYER+

En tant que joueur, je veux renseigner les quatre participants, leurs positions
et le premier serveur afin que PADEL SCORE suive la rotation individuelle.

PLAYER+ connaît :

- deux joueurs par équipe ;
- une consigne vocale par équipe ;
- un joueur à droite et un joueur à gauche dans chaque équipe ;
- le premier joueur serveur ;
- l'ordre individuel du service.

## Position des joueurs

- le premier joueur saisi est à droite par défaut ;
- le second est à gauche par défaut ;
- aucune question vocale supplémentaire n'est posée ;
- « Inverser les côtés » échange les positions en un geste ;
- la saisie manuelle peut choisir explicitement les positions ;
- l'inversion ne modifie ni les noms, ni les consignes, ni le premier serveur ;
- deux joueurs d'une même équipe ne peuvent pas avoir la même position ;
- la position appartient au contexte du match, pas au profil permanent.

La position ne détermine ni le score, ni le serveur, ni la rotation. Elle prépare
l'affichage du terrain et de futures statistiques droite/gauche.

## Parcours commun

1. choisir PLAYER ou PLAYER+ ;
2. répondre vocalement ou au clavier à chaque question ;
3. consulter les valeurs dans un brouillon unique ;
4. en PLAYER+, inverser éventuellement les côtés ;
5. démarrer vocalement ou avec « Démarrer le match » en PLAYER lorsque le
   brouillon est valide.

En PLAYER+, les valeurs sont saisissables et visibles, mais le démarrage reste
désactivé avec la mention « Bientôt disponible ».

Changer de mode remet entièrement le brouillon à zéro. Aucune conversion n'est
effectuée.

## Règles de service

### PLAYER

- serveur courant et prochain serveur par équipe ;
- alternance après chaque jeu ;
- correction par équipe sans modification du score ;
- au tie-break : un point pour la première équipe, puis deux points par équipe ;
- ordre individuel laissé aux joueurs.

### PLAYER+

- quatre identifiants stables `A1`, `A2`, `B1`, `B2` indépendants des noms ;
- homonymes autorisés ;
- premier serveur validé au premier jeu ;
- premier serveur adverse validé au deuxième jeu ;
- ordre complet ensuite figé pour le set ;
- correction par joueur sans modification du score ou des positions ;
- au tie-break : un point pour le premier serveur, puis deux points par joueur ;
- positions inchangées et sans effet sur la rotation ;
- nouvel ordre interne possible au set suivant ;
- `undo()` restaure le bon serveur indépendamment de sa position.

Seuls les participants et la détermination progressive de l’ordre initial sont
actuellement validés. Rotation effective, tie-break, correction et `undo()`
individuels restent sans implémentation PLAYER+.

## Saisie

- la voix reste le parcours principal ;
- chaque question accepte une saisie clavier équivalente ;
- voix et clavier alimentent le même brouillon ;
- une transcription tardive ne remplace pas une saisie manuelle plus récente ;
- le bouton de démarrage reste désactivé tant que le brouillon est invalide.

## État des critères d’acceptation

1. PLAYER reste strictement limité aux équipes.
2. PLAYER+ connaît exactement quatre joueurs.
3. Chaque joueur PLAYER+ possède `RIGHT` ou `LEFT`.
4. Chaque équipe PLAYER+ possède exactement une position de chaque type.
5. Les positions par défaut n'ajoutent aucune question vocale.
6. Les positions peuvent être inversées manuellement en un geste.
7. L'inversion ne modifie aucune autre donnée.
8. Position et ordre de service sont indépendants.
9. Les règles de tie-break existantes sont conservées dans chaque mode.
10. La saisie vocale et le clavier utilisent un brouillon unique.
11. Changer de mode réinitialise la configuration.
12. PLAYER démarre avec le comportement historique inchangé.
13. PLAYER+ reste non démarrable tant que son service individuel n’est pas relié
    au moteur.

Les critères de configuration 1 à 8, 10 et 11 sont représentés dans le parcours
validé. Le critère 9 est validé pour PLAYER uniquement ; les règles de rotation
et de tie-break PLAYER+ restent à implémenter dans le moteur. Le service PLAYER
et son `undo()` sont validés. TASK-018.1 valide les participants, l’état incomplet
après le premier choix et les huit ordres initiaux, sans connexion au moteur.

## Tests restant à prévoir

- cycle individuel en PLAYER+ ;
- tie-break PLAYER+ ;
- correction et `undo()` du serveur individuel indépendamment des positions ;
- connexion du brouillon PLAYER+ au moteur sans régression PLAYER.

La sélection de mode, le parcours guidé voix/clavier, les positions, l’inversion
des côtés, le service PLAYER et son historique sont déjà couverts par les tests
actuels.

## Questions ouvertes

- mode présélectionné ;
- libellés visibles dans le sélecteur ;
- changement éventuel des positions pendant le match ;
- affichage des positions sur la page score et un écran distant ;
- position préférée dans un futur profil ;
- nouvel ordre de service au début d'un set ;
- remplacement d'un joueur.

## Hors périmètre actuel

- statistiques ;
- persistance ;
- remplacement de joueur ;
- commande vocale de position ;
- changement libre de position pendant le match.
