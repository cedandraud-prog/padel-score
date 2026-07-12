# ADR-007 — Stratégie de déploiement

## Statut

Accepted

## Nature de la décision

Cette ADR définit une stratégie produit. Elle ne choisit ni technologie, ni protocole, ni matériel particulier.

## Vision

PADEL SCORE est un produit unique pouvant être déployé selon plusieurs architectures. Son cœur fonctionnel reste identique ; seul son environnement d’exécution évolue.

## Principe fondamental

Le produit ne doit jamais dépendre :

- d’un téléphone ;
- d’un PC ;
- d’un Raspberry Pi ;
- d’un navigateur ;
- d’un type d’écran.

Le cœur métier doit rester portable.

## Niveaux de déploiement

### Niveau 1 — PLAYER

Le joueur apporte :

- son téléphone ;
- sa connexion Internet ;
- éventuellement son micro Bluetooth ;
- éventuellement son haut-parleur Bluetooth.

Le club ne fournit aucun équipement. L’écran du téléphone suffit.

Objectif : permettre la découverte du produit.

### Niveau 2 — AFFILIATED CLUB

Le joueur conserve son téléphone. Le club fournit :

- un écran fixe ;
- éventuellement un haut-parleur fixe ;
- éventuellement un micro mis à disposition.

Le téléphone devient le cerveau et se connecte automatiquement au terrain. Le club améliore l’expérience sans remplacer le cœur fonctionnel.

### Niveau 3 — PARTNER CLUB

Le club possède des équipements fixes et le téléphone devient facultatif.

Le club dispose d’une application de supervision permettant notamment :

- l’état des terrains ;
- le suivi des matchs ;
- les scores en direct ;
- l’historique ;
- les statistiques.

### Niveau 4 — TOURNAMENT

Le produit ajoute des fonctions de tournoi, par exemple :

- le suivi de plusieurs terrains ;
- la détection automatique des terrains libérés ;
- la réaffectation des matchs ;
- l’affichage centralisé ;
- la supervision.

Les règles précises de tournoi ne sont pas définies dans cette ADR.

## Architecture produit

Le cœur logiciel repose sur des moteurs indépendants :

- Conversation Engine ;
- Score Engine ;
- Game Session ;
- Match Format.

Des modules peuvent être activés selon le niveau de déploiement :

- Voice ;
- Display ;
- Connection ;
- Club ;
- Tournament ;
- Statistics.

Les niveaux de déploiement n’introduisent pas de cœur logiciel différent. Ils activent simplement davantage de modules autour des mêmes moteurs indépendants.

Le même cœur logiciel doit pouvoir fonctionner :

- sur un téléphone ;
- sur un boîtier terrain ;
- sur un mini-PC ;
- sur une infrastructure club.

## Conséquences

- le cœur du logiciel ne peut pas être couplé à un matériel particulier ;
- les interfaces et modules périphériques doivent rester remplaçables ;
- l’environnement d’exécution peut évoluer sans modifier les règles fonctionnelles ;
- le choix du matériel est une décision de déploiement, pas une décision d’architecture ;
- chaque niveau enrichit l’expérience sans créer un produit fonctionnellement distinct.

## Roadmap produit

La progression visée est :

```text
MLP              → PLAYER
GO               → AFFILIATED CLUB
Version suivante → PARTNER CLUB
Version avancée  → TOURNAMENT
```

Cette correspondance ne définit ni calendrier ni estimation de coûts.

## Hors périmètre

Cette ADR ne définit pas :

- les règles détaillées du mode tournoi ;
- un calendrier de livraison ;
- les coûts des différents niveaux ;
- le choix d’un protocole de communication ;
- le choix de composants ou de technologies.
