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
- sur téléphone, la configuration restait enfermée dans un bloc trop étroit et
  débordait horizontalement à cause d'une largeur minimale pensée pour le
  tableau de score ;
- la commande principale « Nouveau match » ressemblait à une simple aide ;
- les champs éditables faisaient croire à un parcours manuel complet alors que
  le démarrage réellement validé est vocal.

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

### Configuration mobile plein format

Sur téléphone, `MatchSetup` devient l'expérience principale et occupe toute la
largeur ainsi qu'au minimum la hauteur visible utile. La mise en page utilise
la hauteur dynamique du viewport, respecte les safe areas de la PWA et ne
produit aucun débordement horizontal sur un écran étroit.

La hiérarchie commence par :

> Dites
> « Nouveau match »
> pour commencer.

Cette commande est l'action visuelle dominante. L'état réel de l'écoute et la
question en cours apparaissent avant les informations déjà reconnues.

Les anciens champs deviennent des zones de restitution non éditables. Ils
affichent « En attente… » puis les valeurs reconnues au fil du dialogue. Le
sélecteur de feedback et le bouton de secours restent disponibles dans une zone
secondaire « Autres options », sans concurrencer le parcours vocal.

### Recommencer la configuration

Pendant toute configuration vocale active, un bouton tactile secondaire
« Recommencer » reste visible sous l'étape courante. Son aide précise :

> Efface la configuration en cours et reprend depuis le début.

Le bouton « Recommencer » réinitialise entièrement la configuration sans
quitter l'expérience en cours. Il devient le moyen principal de sortir d'un
dialogue vocal bloqué et n'apparaît jamais sur l'écran de score. La commande
vocale historique reste compatible, mais elle n'est plus présentée comme le
moyen principal. Les deux entrées utilisent le même cas d'usage applicatif :

- le brouillon et les validations temporaires sont effacés ;
- le dialogue revient à la première question ;
- le système annonce brièvement : « D'accord, recommençons la configuration. » ;
- l'ExperienceSession reste en configuration ;
- l'écoute et le Wake Lock restent actifs ;
- aucune nouvelle session concurrente n'est créée ;
- un double appui rapide ne déclenche qu'un seul redémarrage ;
- une transcription tardive de l'ancienne étape est ignorée ;
- l'utilisateur ne revient pas à l'accueil et le match ne démarre pas.

Après l'appui tactile, l'écoute de l'étape en cours est arrêtée, puis le système
annonce exactement :

> D'accord, recommençons la configuration. Nom de la première équipe ?

La reconnaissance reprend une seule fois après la fin de cette annonce. Le
Wake Lock reste actif parce que l'ExperienceSession demeure dans l'état
`CONFIGURING`.

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
12. Le bouton « Recommencer » fonctionne à toute étape de la configuration vocale.
13. Le brouillon est remis à zéro avant la reprise à la première question.
14. L'ExperienceSession, l'écoute et le Wake Lock restent actifs.
15. « Recommencer » n'a aucun effet sur un match déjà lancé.
16. Le bouton tactile « Recommencer » est visible à chaque étape de la
    configuration vocale et absent de l'écran de score.
17. Le bouton et la commande vocale produisent exactement la même remise à zéro.
18. Une ancienne transcription ne peut pas remplir le nouveau brouillon.
19. Un double appui rapide ne produit qu'une annonce et une reprise d'écoute.
20. `MatchSetup` occupe le viewport mobile sans défilement horizontal à 320,
    360 et 390 px de large.
21. « Nouveau match » est présenté comme l'action principale avant l'état de
    l'écoute et les informations reconnues.
22. Les noms, consignes vocales et le serveur sont restitués sans input
    éditable.
23. Le dialogue vocal, le Wake Lock et le démarrage réel du match restent
    inchangés.

## Validation terrain attendue

Le Human Validator vérifie sur le téléphone PLAYER :

- la compréhension immédiate de « Consigne vocale » ;
- la visibilité et la compréhension du bouton « Recommencer » ;
- la remise à zéro effective depuis plusieurs étapes du dialogue ;
- l'accessibilité du bouton tactile d'une main sur le téléphone ;
- l'absence de double annonce ou de double écoute après deux appuis rapides ;
- les réponses par nom affiché et par consigne à « Qui sert ? » ;
- le retour fluide au match après « Non » ;
- la lisibilité de l'aide repliable pendant le jeu ;
- le nombre et la qualité des voix françaises réellement exposées sur Android ;
- la compréhension immédiate de l'action « Nouveau match » en Chrome et dans la
  PWA installée ;
- l'absence de débordement en portrait sur des écrans de 320, 360 et 390 px ;
- la compréhension des informations comme des résultats vocaux et non comme un
  formulaire à remplir.
