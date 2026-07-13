# US-002 — Lancement par QR Code

## User Story

En tant que joueur arrivant sur un terrain, je veux scanner un QR Code afin d’ouvrir immédiatement PADEL SCORE sans rechercher ni saisir une adresse.

## Valeur attendue

Supprimer une étape de lancement avant le match et rendre l’essai accessible sans assistance.

## Critères d’acceptation

- le QR Code ouvre l’URL publique stable de PADEL SCORE ;
- aucune application spécifique n’est nécessaire pour le scanner sur un téléphone compatible ;
- si PADEL SCORE est installé, le système peut proposer ou utiliser l’application selon les capacités de la plateforme ;
- si PADEL SCORE n’est pas installé, la PWA s’ouvre dans le navigateur et reste installable ;
- le QR Code ne contient aucune donnée de match ni logique métier ;
- une même URL pourra être utilisée ultérieurement par un tag NFC.

## Dépendance

La génération et l’impression du QR Code nécessitent une URL de déploiement stable. Elles ne font pas partie de MLP-001 tant que cette URL n’est pas validée.

## Validation terrain

Placer le QR Code à l’entrée du terrain et mesurer si un nouveau joueur peut ouvrir PADEL SCORE sans explication.
