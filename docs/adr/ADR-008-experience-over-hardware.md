# ADR-008 — L’expérience prime sur le matériel

## Statut

Accepted

## Contexte

Les premiers ateliers ont montré que la valeur de PADEL SCORE ne réside pas dans un matériel propriétaire. Elle réside dans une expérience de suivi de match discrète, naturelle et fiable.

Le matériel permet cette expérience, mais ne la définit pas.

## Décision

Le cœur de PADEL SCORE est indépendant du matériel utilisé. Le logiciel peut exploiter différents périphériques selon le contexte, sans modifier l’expérience essentielle.

Le matériel est interchangeable. L’expérience reste identique.

> Vous choisissez votre matériel. PADEL SCORE s’adapte.

Le produit commercial est l’expérience PADEL SCORE, pas un équipement imposé.

## Niveaux de déploiement

### PLAYER

Le joueur utilise son propre matériel. Il peut notamment choisir :

- un téléphone seul ;
- un téléphone et un casque à conduction osseuse ;
- un téléphone et une montre connectée ;
- un téléphone, un micro personnel et une enceinte Bluetooth ;
- un téléphone et un futur POD propriétaire.

PADEL SCORE s’adapte à l’équipement disponible. Aucun matériel particulier n’est obligatoire.

### CLUB READY

Le club améliore l’expérience en mettant éventuellement à disposition :

- des micros ;
- des enceintes ;
- des stations de recharge.

Les joueurs continuent à utiliser leurs téléphones.

### SMART COURT

Le terrain devient progressivement autonome. Il peut intégrer :

- un écran ;
- une enceinte fixe ;
- un microphone ;
- une électronique dédiée.

Le téléphone devient optionnel.

### SMART CLUB

Tous les terrains remontent leurs informations. Le gestionnaire dispose d’une vue globale et peut piloter :

- les terrains ;
- les matchs ;
- l’occupation ;
- les statistiques.

### TOURNAMENT

La même infrastructure reçoit des fonctionnalités supplémentaires :

- programmation ;
- arbitrage ;
- tableaux ;
- résultats ;
- diffusion.

## Principes

- le matériel est interchangeable ;
- le cœur métier reste indépendant du téléphone, du microphone, du haut-parleur, du casque, de la montre et du terrain ;
- le système exploite les périphériques disponibles ;
- la meilleure expérience commence avec le matériel déjà possédé par le joueur ;
- PADEL SCORE optimise l’existant avant de créer un matériel propriétaire.

## Conséquences

- chaque périphérique doit rester remplaçable indépendamment ;
- aucun cas d’usage métier ne doit dépendre d’un équipement particulier ;
- les choix matériels deviennent des décisions de déploiement ;
- le futur POD reste pertinent comme implémentation premium, mais n’est jamais une obligation ;
- le cœur logiciel est partagé par tous les niveaux de déploiement.

## Roadmap produit

```text
PLAYER
  ↓
CLUB READY
  ↓
SMART COURT
  ↓
SMART CLUB
  ↓
TOURNAMENT
```

Le matériel évolue. Le cœur logiciel reste identique.

## Relation avec ADR-007

Cette ADR complète la stratégie définie dans ADR-007 et en précise la nomenclature :

- `AFFILIATED CLUB` devient `CLUB READY` ;
- `PARTNER CLUB` est distingué en `SMART COURT` et `SMART CLUB`.

En cas de divergence sur les niveaux de déploiement ou la place du matériel, ADR-008 prévaut.

## Hors périmètre

Cette décision ne choisit aucun composant, périphérique, protocole ou fournisseur. Elle ne déclenche aucune implémentation technique immédiate.
