# Modèle conceptuel d’une définition de sport

## Objectif

Décrire les informations qu’un sport devra fournir à une future plateforme commune, sans figer une interface technique avant la comparaison de plusieurs cas réels.

PADEL SCORE reste aujourd’hui le vertical padel. Ce modèle prépare la comparaison avec un deuxième sport, probablement le tennis ; il ne remplace pas le moteur actuel.

## Identité

Une définition précise :

- un identifiant stable ;
- un nom destiné aux utilisateurs ;
- les variantes ou disciplines qu’elle couvre ;
- sa version et son statut de validation.

## Participants

Elle décrit :

- la composition autorisée des équipes ;
- le nombre de participants ;
- les rôles utiles au déroulement du match ;
- les règles éventuelles de service ou de rotation.

## État sportif

Elle définit les éléments nécessaires pour représenter un match dans ce sport, leurs valeurs possibles et leurs relations. Les niveaux de score ne sont pas supposés identiques d’un sport à l’autre.

## Événements et transitions

Elle énumère :

- les événements de score autorisés ;
- les préconditions de chaque événement ;
- leurs effets sur l’état ;
- les transitions automatiques ;
- les situations invalides.

## Fin et poursuite

Elle précise :

- les conditions de victoire ;
- les formats possibles ;
- les cas où une session peut continuer sans vainqueur ;
- les informations constituant un résultat final ou incomplet.

## Correction et historique

Elle indique ce qui peut être corrigé, dans quel contexte, avec quelles validations et comment une correction s’inscrit dans l’historique des événements.

## Vocabulaire et commandes

Elle fournit le vocabulaire propre au sport pour :

- afficher le score ;
- annoncer les transitions ;
- interpréter les commandes autorisées ;
- éviter les ambiguïtés avec les participants ou équipes.

Le vocabulaire conversationnel commun éventuel ne pourra être extrait qu’après comparaison de plusieurs sports.

## Configuration

Elle décrit les choix nécessaires avant une session : format, participants, service initial et autres options réellement propres au sport.

## Indépendance des périphériques

Une définition de sport ne choisit aucun téléphone, microphone, haut-parleur, écran, réseau ou terrain. Elle décrit des règles et des besoins d’interaction ; les adaptateurs exposent séparément les capacités disponibles.

## Validation d’une définition

Avant de servir de base à une abstraction commune, une définition doit être :

1. complète sur les règles nécessaires au parcours visé ;
2. relue avec une expertise du sport concerné ;
3. testable par des scénarios métier explicites ;
4. confrontée à une expérience verticale réelle ;
5. comparée à au moins une autre définition complète.

## Limites actuelles

Ce document ne constitue ni une interface TypeScript, ni un schéma de données, ni une Task d’implémentation. Les frontières finales du noyau commun restent à découvrir par la comparaison padel–tennis.
