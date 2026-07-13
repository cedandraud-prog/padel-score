# US-005 — Premiers retours sur le parcours vocal

## Problème observé

Le premier test utilisateur réel du MLP PLAYER a montré plusieurs écarts entre
le vocabulaire du produit et le langage spontané du joueur :

- la commande permettant de lancer une configuration vocale n'était pas assez
  visible ;
- « nom vocal » décrivait un concept technique plutôt qu'une consigne donnée au
  système ;
- à la question « Qui sert ? », le joueur pouvait répondre naturellement avec
  le nom affiché alors que seule la consigne vocale était reconnue ;
- « Confirmer ou Annuler » était moins naturel que « Oui ou Non » après une
  demande de fin de match ;
- les principales commandes disponibles pendant le match n'étaient pas
  consultables sur l'écran de score ;
- la voix des annonces dépendait du navigateur sans diagnostic explicite.

## User Story

En tant que scoreur, je veux comprendre les mots que PADEL SCORE attend et
répondre avec un vocabulaire naturel afin de piloter le match sans interrompre
le jeu.

## Décisions retenues

### Démarrage de la configuration

La page de configuration affiche une aide courte :

> Dites « Nouveau match » pour lancer la configuration vocale.

Les champs manuels et le bouton « Configurer à la voix » restent disponibles ;
aucun nouveau parcours n'est créé.

Le bouton « Démarrer le match » est supprimé de la page de configuration : il
ne déclenchait plus le parcours réellement validé et créait une attente
trompeuse. Le démarrage effectif reste piloté par le dialogue vocal et le
contrôleur applicatif après validation complète de la configuration.

### Recommencer la configuration

La page indique également :

> Dites « Recommencer » pour effacer la configuration en cours et reprendre
> depuis le début.

La commande est disponible à chaque étape avant le démarrage, notamment après
un nom d'équipe mal reconnu, pendant la saisie d'une consigne vocale ou pendant
le choix du serveur.

Lorsqu'elle est reconnue par correspondance normalisée exacte :

- le brouillon et les validations temporaires sont effacés ;
- le dialogue revient à la première question ;
- le système annonce brièvement : « D'accord, recommençons la configuration. » ;
- l'ExperienceSession reste en configuration ;
- l'écoute et le Wake Lock restent actifs ;
- aucune nouvelle session concurrente n'est créée ;
- l'utilisateur ne revient pas à l'accueil et le match ne démarre pas.

### Vocabulaire des équipes

Le libellé utilisateur « Nom vocal » devient « Consigne vocale ».

Les concepts internes existants peuvent conserver leur nom lorsqu'un renommage
n'apporte aucune valeur utilisateur. Le comportement reste identique : la
consigne vocale exacte attribue un point pendant le match.

### Choix du serveur

À la question « Qui sert ? », le système accepte après normalisation exacte :

- le nom affiché de l'équipe ;
- sa consigne vocale.

La normalisation ignore la casse, les accents, la ponctuation périphérique et
les espaces superflus. Aucun rapprochement flou n'est utilisé.

Si une réponse peut désigner les deux équipes, le système ne choisit pas. Il
demande les deux consignes vocales exactes pour lever l'ambiguïté.

### Fin de match

Le système demande désormais :

> Confirmer la fin du match ? Oui ou non ?

- « Oui » clôture la session au score courant ;
- « Non » annule uniquement la demande et reprend la session sans modifier le
  score ;
- « Confirmer » et « Annuler » restent acceptés comme synonymes de
  compatibilité, mais ne sont plus demandés au joueur ;
- toute autre commande reste sans effet tant que cette réponse est attendue.

### Commandes visibles pendant le match

Une zone repliable « Commandes vocales » documente uniquement :

- **Annuler** — retire la dernière action ;
- **Corriger** — permet de rectifier les points du jeu en cours ;
- **Fin de match** — demande la clôture du match avec confirmation.

Cette aide est non bloquante et n'altère pas la lecture du tableau de score.

## Voix des annonces

Le navigateur fournit les voix installées ou exposées sur l'appareil via
`speechSynthesis.getVoices()`. Cette liste peut être vide au premier chargement,
puis évoluer avec l'événement `voiceschanged`. Elle dépend du système, du
navigateur et des voix installées : un PC et un téléphone Android peuvent donc
présenter des listes différentes.

Le diagnostic développeur :

- liste uniquement les voix françaises avec leur nom, leur langue et leur état
  par défaut ;
- indique la voix actuellement utilisée ;
- permet de tester une voix ;
- mémorise localement le choix sur l'appareil.

Ce réglage n'apparaît pas dans le parcours normal du joueur. Si aucune voix
française n'est exposée, le navigateur conserve sa voix par défaut et le match
reste utilisable.

## Critères d'acceptation

1. La commande « Nouveau match » est visible sur la page de configuration.
2. Tous les libellés utilisateur emploient « Consigne vocale ».
3. Le nom affiché ou la consigne vocale permettent de choisir le serveur.
4. Une réponse serveur ambiguë ne sélectionne aucune équipe.
5. La question de fin de match demande « Oui ou Non ».
6. « Non » conserve exactement le score et reprend l'écoute normale.
7. Les synonymes historiques restent compatibles sans être proposés.
8. L'aide de la page score ne documente que des commandes fonctionnelles.
9. La sélection de voix reste limitée au diagnostic et au stockage local.
10. Aucune règle de score n'est modifiée.
11. Le bouton « Démarrer le match » n'apparaît plus sur la configuration.
12. « Recommencer » fonctionne à toute étape de la configuration vocale.
13. Le brouillon est remis à zéro avant la reprise à la première question.
14. L'ExperienceSession, l'écoute et le Wake Lock restent actifs.
15. « Recommencer » n'a aucun effet sur un match déjà lancé.

## Validation terrain attendue

Le Human Validator vérifie sur le téléphone PLAYER :

- la compréhension immédiate de « Consigne vocale » ;
- la visibilité et la compréhension de la commande « Recommencer » ;
- la remise à zéro effective depuis plusieurs étapes du dialogue ;
- les réponses par nom affiché et par consigne à « Qui sert ? » ;
- le retour fluide au match après « Non » ;
- la lisibilité de l'aide repliable pendant le jeu ;
- le nombre et la qualité des voix françaises réellement exposées sur Android.
