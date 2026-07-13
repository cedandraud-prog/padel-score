# ADR-010 — Architecture produit multisport

## Statut

Accepted

## Contexte

PADEL SCORE a été conçu pour le padel et reste le premier vertical ainsi que le premier cas de validation terrain.

À terme, la même capacité de suivi de match pourra servir d’autres sports à score structuré, notamment le tennis, le badminton ou le pickleball. Cette orientation ne justifie pas de transformer immédiatement le moteur padel en moteur générique : un seul cas réel ne permet pas encore d’identifier les bonnes abstractions.

## Décision

L’architecture produit cible distingue trois niveaux :

1. un noyau commun issu d’invariants réellement observés ;
2. des définitions de sport explicites ;
3. des expériences verticales spécialisées.

Les périphériques restent des adaptateurs indépendants de ces trois niveaux.

PADEL SCORE demeure le produit vertical consacré au padel. Un même noyau logiciel pourra à terme servir plusieurs produits ou marques verticales, sans leur imposer immédiatement une interface ou une expérience commerciale générique.

Cette décision définit une direction produit. Elle n’autorise aucune généralisation technique du `ScoreEngine` actuel.

## Noyau commun potentiel

Le noyau commun pourra porter les concepts dont le sens est identique dans plusieurs sports validés, par exemple :

- cycle d’une session ;
- participants et équipes ;
- événements de score et historique ;
- correction et commandes ;
- sorties audio et visuelles ;
- synchronisation ;
- capacités disponibles.

Cette liste est une hypothèse de travail, pas un contrat technique définitif.

## Définition de sport

Chaque sport décrit explicitement :

- son identifiant et son nom ;
- son modèle de participants ;
- ses règles et états de score ;
- ses événements autorisés ;
- ses conditions de victoire ou de poursuite ;
- son vocabulaire d’annonce ;
- ses commandes vocales ;
- ses règles de correction ;
- ses options de configuration.

Les notions `15`, `30`, `40`, jeu, set et tie-break appartiennent à la définition des sports concernés. Elles ne doivent pas devenir des concepts universels du noyau cible.

## Expérience verticale

Un vertical peut conserver :

- sa marque et sa promesse ;
- son interface ;
- ses parcours de configuration et de commercialisation ;
- ses fonctionnalités propres au contexte du sport.

Le moteur sportif décrit les règles. L’expérience verticale décide comment elles sont présentées et utilisées. PADEL SCORE conserve aujourd’hui ces deux dimensions pour le padel sans être renommé.

## Adaptateurs matériels

Les périphériques et modes de déploiement ne définissent aucune règle sportive. Téléphone, microphone, haut-parleur, écran, montre ou terrain équipé exposent uniquement leurs capacités à travers des adaptateurs remplaçables.

Une définition de sport doit rester indépendante du matériel disponible.

## Généralisation différée

La généralisation technique ne pourra commencer qu’après :

1. validation terrain suffisante du vertical padel ;
2. définition complète d’un deuxième sport, le tennis étant le cas recommandé ;
3. comparaison explicite des modèles padel et tennis ;
4. identification et validation des invariants réellement communs.

Une abstraction ne sera considérée comme commune que si :

- elle est observée dans au moins deux définitions de sport complètes ;
- elle conserve le même sens et le même cycle de vie dans les deux cas ;
- elle ne contient aucun vocabulaire ou règle propre à un sport ;
- elle répond à un besoin produit réel et testable ;
- son extraction simplifie les deux verticaux sans réduire leur capacité de spécialisation.

## Parcours cible

À terme, si la comparaison des sports le justifie :

```text
Lancement
  ↓
Choix du sport
  ↓
Chargement de sa définition
  ↓
Configuration du match
  ↓
Expérience adaptée au sport
```

La sélection du sport n’est pertinente qu’après l’existence d’au moins deux définitions validées. Elle n’est pas implémentée aujourd’hui.

## Conséquences

- PADEL SCORE reste prioritaire et ne doit pas être ralenti par une plateforme hypothétique ;
- le tennis devient le deuxième cas de comparaison recommandé ;
- le moteur padel actuel reste inchangé jusqu’à cette comparaison ;
- les futures règles sportives devront être séparées des périphériques et de l’expérience commerciale ;
- un noyau commun pourra servir plusieurs applications ou marques verticales ;
- une interface multisport unique n’est ni imposée ni exclue à ce stade.

## Questions ouvertes

- Une seule application proposera-t-elle plusieurs sports ou plusieurs applications verticales partageront-elles le noyau ?
- Une marque plateforme distincte sera-t-elle nécessaire au-dessus de PADEL SCORE ?
- Quel niveau de validation terrain du padel sera suffisant avant de modéliser le tennis ?
- Le tennis est-il définitivement le meilleur second cas de comparaison ?
- Quelles commandes et annonces relèvent réellement du noyau plutôt que de chaque vertical ?
- Comment versionner et faire évoluer une définition de sport sans casser les sessions existantes ?
- Quelles capacités collaboratives ou de synchronisation seront communes à plusieurs sports ?

Ces questions devront être arbitrées à partir de modèles complets et d’observations réelles, pas par anticipation.

## Hors périmètre

Cette ADR ne modifie ni le `ScoreEngine`, ni les règles du padel, ni le parcours actuel. Elle ne crée aucun sélecteur de sport, aucune interface TypeScript générique et aucun nouveau produit.
