# ADR-002 — Architecture matérielle du tableau de score

## Objectif

Définir les besoins matériels du tableau de score sans choisir de composants.

## Contraintes

Le tableau doit être :

- visible à 20 mètres ;
- lisible en plein soleil ;
- robuste ;
- léger ;
- simple à installer ;
- simple à alimenter ;
- peu coûteux ;
- évolutif.

## Affichage

Les informations sont classées selon leur priorité visuelle pendant un match.

### Priorité 1 — Lecture immédiate

- nom de l’équipe A ;
- nom de l’équipe B ;
- points de l’équipe A ;
- points de l’équipe B.

### Priorité 2 — Situation du match

- jeux gagnés par chaque équipe dans le set en cours ;
- sets gagnés par chaque équipe ;
- équipe au service.

### Priorité 3 — Information complémentaire

- temps de jeu.

Les informations de priorité 1 doivent pouvoir être comprises en moins d’une seconde depuis le terrain. Les informations moins prioritaires ne doivent pas réduire leur lisibilité.

## Communication

Le tableau doit pouvoir recevoir l’état du match produit par le moteur de score et actualiser l’affichage avec une latence compatible avec le jeu.

La communication doit :

- transmettre l’état utile du match de manière fiable ;
- détecter une interruption de liaison ;
- permettre de retrouver un affichage cohérent après une reconnexion ;
- éviter qu’une perte temporaire de liaison affiche un score trompeur ;
- permettre le remplacement indépendant de l’interface de commande et du tableau ;
- rester utilisable dans l’environnement réel d’un terrain de padel.

Aucun protocole de communication n’est retenu à ce stade.

## Alimentation

L’alimentation doit :

- couvrir la durée d’utilisation prévue pour chaque version du produit ;
- permettre une mise en service simple ;
- indiquer suffisamment tôt une alimentation insuffisante ;
- préserver l’état sûr du tableau en cas d’interruption ;
- être adaptée à une installation temporaire pour la version portable ;
- être adaptée à une utilisation continue pour la version fixe ;
- limiter les opérations de maintenance.

Aucune technologie d’alimentation ni aucune batterie n’est retenue à ce stade.

## Fixation

### Terrain fixe

- permettre une installation durable ;
- ne pas gêner les joueurs, les accès ou l’entretien du terrain ;
- conserver une orientation lisible depuis les zones de jeu ;
- résister aux contraintes normales d’une installation sportive.

### Version portable

- permettre une installation et un retrait rapides ;
- rester stable pendant toute la durée du match ;
- être transportable par une personne ;
- ne pas nécessiter de modification permanente du terrain.

### Protection contre les impacts

- protéger le tableau contre les impacts prévisibles liés au jeu ;
- éviter de créer un danger supplémentaire pour les joueurs ;
- conserver les fonctions essentielles après les sollicitations normales du terrain.

### Visibilité

- garantir une ligne de vue suffisante depuis les principales positions de jeu ;
- éviter les emplacements exposés à des occultations fréquentes ;
- permettre une lecture rapide sans détourner durablement l’attention du match.

## Versions envisagées

### PADEL SCORE GO

Version portable destinée à une installation temporaire sur un terrain.

### PADEL SCORE CLUB

Version fixe destinée à une installation durable et à une utilisation régulière au sein d’un club.

Les deux versions doivent partager le même moteur de score et préserver des interfaces remplaçables.

## Questions ouvertes

- Quelles dimensions minimales permettent une lecture fiable à 20 mètres ?
- Quels niveaux de contraste et de luminosité garantissent la lisibilité en plein soleil ?
- Quelles informations peuvent être masquées sans nuire à la compréhension du match ?
- Quel temps maximal d’actualisation reste acceptable après un point ?
- Quelle autonomie d’usage est nécessaire pour PADEL SCORE GO ?
- Quel mode d’alimentation convient aux contraintes de PADEL SCORE CLUB ?
- Comment signaler une liaison interrompue sans afficher une information trompeuse ?
- Comment signaler une alimentation bientôt insuffisante ?
- Quelles contraintes environnementales et d’impact doivent être mesurées sur le terrain ?
- Quels emplacements de fixation sont autorisés et réellement disponibles selon les terrains ?
- Quel poids maximal permet une installation portable par une personne ?
- Quelles limites de coût doivent être retenues pour chaque version ?
- Quelles possibilités d’évolution doivent être réservées dès la première architecture matérielle ?
