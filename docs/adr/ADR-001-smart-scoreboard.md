# ADR-001 — Positionnement du produit et architecture cible

## Statut

Accepted

## Décision

PADEL SCORE est un tableau de score sportif intelligent.

Le produit principal n’est pas une application. L’application n’est qu’un moyen de développer et de tester le produit. Le produit commercial est un équipement sportif.

## Pourquoi

Les joueurs doivent pouvoir consulter le score en moins d’une seconde.

Le matériel doit être :

- robuste ;
- visible en plein soleil ;
- très lisible ;
- simple ;
- peu coûteux.

Un tableau sportif répond mieux à ce besoin qu’un écran classique.

## Conséquences

Le cœur du produit devient :

- Score Engine ;
- tableau de score ;
- micro ;
- haut-parleur.

Les interfaces logicielles pourront évoluer indépendamment. Le moteur de score reste totalement indépendant.

## Produits envisagés

### PADEL SCORE GO

- version portable ;
- batterie ;
- installation temporaire.

### PADEL SCORE CLUB

- installation fixe ;
- alimentation secteur ;
- intégration au club.

Les deux produits partagent exactement le même moteur logiciel.
