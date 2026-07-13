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
- la voix des annonces dépendait du navigateur sans diagnostic explicite ;
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

Le bouton secondaire « Configurer à la voix » reste disponible ; aucun parcours
manuel concurrent n'est créé.

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
affichent « En attente… » puis les valeurs reconnues au fil du dialogue. La
configuration reste entièrement vocale. Le sélecteur de feedback et le bouton
de secours restent disponibles dans une zone secondaire « Autres options »,
sans concurrencer le parcours vocal.

### Recommencer la configuration

Pendant toute configuration vocale active, un bouton tactile secondaire
« Recommencer » reste visible sous l'étape courante. Son aide précise :

> Efface la configuration en cours et reprend depuis le début.

Le bouton « Recommencer » réinitialise entièrement la configuration sans
quitter l'expérience en cours. Il devient le moyen principal de sortir d'un
dialogue vocal bloqué et n'apparaît jamais sur l'écran de score. La commande
vocale historique reste compatible, mais elle n'est plus présentée comme le
moyen principal. Les deux entrées utilisent le même cas d'usage applicatif :

- le brouillon est effacé sans conserver de donnée liée à l'ancien test de
  reconnaissance ;
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

La consigne vocale est le mot que le scoreur prononce pendant le match pour
attribuer un point à l'équipe. La question explique ce rôle avant la réponse :

> Quelle consigne vocale souhaitez-vous utiliser pour cette équipe ? Pendant le
> match, vous prononcerez ce mot pour lui attribuer un point.

Après chaque consigne reconnue et validée, le système confirme son usage avec la
consigne et le nom affiché réels, par exemple :

> Très bien. Pendant le match, dites « Bleu » pour donner un point à Les Bleus.

L'ancienne étape séparée de test de reconnaissance est supprimée : elle ne
produisait plus de valeur. Le parcours enchaîne désormais directement nom
affiché A, consigne vocale A, nom affiché B, consigne vocale B, choix du serveur,
puis confirmation et démarrage. Les règles de validité des consignes restent
inchangées : elles doivent être non vides, courtes, distinctes et différentes
des commandes réservées.

Sur la page de configuration, une aide secondaire rappelle près de chaque
« Consigne vocale » qu'il s'agit du mot à prononcer pour attribuer un point. Dès
que le mot est connu, l'aide reprend cette valeur. Aucun champ éditable n'est
réintroduit.

### Choix du serveur

À la question « Qui sert ? », le système accepte après normalisation exacte :

- le nom affiché de l'équipe ;
- sa consigne vocale.

La normalisation ignore la casse, les accents, la ponctuation périphérique et
les espaces superflus. Aucun rapprochement flou n'est utilisé.

Si une réponse peut désigner les deux équipes, le système ne choisit pas. Il
demande les deux consignes vocales exactes pour lever l'ambiguïté.

### Corrections visuelles locales

Pendant le match uniquement, le nom affiché d'une équipe peut être modifié
directement depuis son libellé. Cette correction ne modifie jamais sa consigne
vocale ou le score et ne relance pas la configuration.

Pendant une session en cours, le marqueur de service de chaque équipe est un
contrôle discret. Le sélectionner corrige uniquement l'équipe affichée au
service. Les points, jeux et sets restent identiques et les rotations suivantes
conservent cette correction.

La commande vocale « Serveur » ouvre le même cas d'usage. Le système demande
« Quelle équipe sert ? », puis accepte exactement le nom affiché ou la consigne
vocale de l'équipe. Le contrôle manuel et la commande vocale partagent la même
logique de correction.

Les noms affichés reconnus vocalement sont capitalisés automatiquement. Les
accents, apostrophes et traits d'union sont conservés. Une correction manuelle
reste toujours possible.

Le tableau de score redevient l'élément principal : points, jeux, sets et
service restent visibles sur les petits écrans. Les contrôles de correction et
l'aide apparaissent après le score.

L'annonce « Score complet » énonce les sets, les jeux, les points et le prochain
service. La page score affiche également le prochain serveur sous le tableau.

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

Un panneau repliable « Consignes vocales » documente uniquement les commandes
réellement disponibles :

- les deux consignes vocales d'équipe ;
- **Score** et **Score complet** ;
- **Annuler** — retire la dernière action ;
- **Corriger** — permet de rectifier les points du jeu en cours ;
- **Serveur** — corrige l'équipe au service ;
- **Fin de match** — demande la clôture du match avec confirmation.
- **Oui** et **Non** — répondent à cette confirmation.
- **Termine écoute** — suspend la reconnaissance vocale.

Cette aide est non bloquante et reste visuellement secondaire par rapport au
tableau de score.

### Suspension de l'écoute

Un bouton permanent affiche « Désactiver l'écoute » lorsque l'écoute est active
et « Réactiver l'écoute » lorsqu'elle est suspendue. Cette action ne modifie ni
la session de jeu, ni l'ExperienceSession, ni le Wake Lock. La réactivation
reprend une seule session de reconnaissance.

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
22. Les noms, consignes vocales et le serveur sont restitués sans formulaire
    manuel concurrent ; l'édition du nom affiché demande une action explicite.
23. Le dialogue vocal, le Wake Lock et le démarrage réel du match restent
    inchangés.
24. Un nom affiché peut être corrigé uniquement sur la page score sans modifier
    sa consigne vocale.
25. Le serveur peut être corrigé pendant le match sans modifier le score.
26. Les noms reconnus vocalement sont capitalisés en conservant accents,
    apostrophes et traits d'union.
27. Points, jeux, sets et service restent lisibles à 320, 360 et 390 px.
28. Les commandes « Annuler », « Corriger » et « Fin de match » sont visibles
    sans explication longue.
29. La simplicité visuelle ne supprime aucune commande ou information utile.
30. « Serveur » demande l'équipe au service puis accepte son nom affiché ou sa
    consigne vocale.
31. L'annonce complète contient sets, jeux, points et prochain service avec les
    accords singulier/pluriel.
32. Le prochain serveur est également visible sous le tableau de score.
33. Le panneau « Consignes vocales » reste repliable et ne documente que des
    commandes implémentées.
34. Désactiver puis réactiver l'écoute conserve la session, l'ExperienceSession
    et le Wake Lock sans créer de reconnaissance concurrente.
35. Aucune étape ni donnée de test de reconnaissance ne subsiste dans la
    configuration vocale.
36. La question « Consigne vocale » explique que le mot choisi attribuera un
    point pendant le match.
37. La confirmation reprend dynamiquement la consigne et le nom affiché de la
    bonne équipe.
38. Le parcours passe directement de la consigne A au nom B, puis de la consigne
    B à « Qui sert ? ».
39. Une aide courte et non éditable explique le rôle de chaque consigne sur la
    page de configuration.

## Validation terrain attendue

Le Human Validator vérifie sur le téléphone PLAYER :

- la compréhension immédiate de « Consigne vocale » ;
- la fluidité du parcours raccourci sans test de reconnaissance séparé ;
- la compréhension de la confirmation pédagogique après chaque consigne ;
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
  formulaire à remplir ;
- l'absence de toute édition manuelle sur la configuration ;
- la correction immédiate d'un nom affiché sur le score sans perte de la
  consigne vocale ;
- la correction du serveur sans changement du score ;
- le dialogue « Serveur » avec un nom affiché puis une consigne vocale ;
- la présence du prochain serveur dans l'annonce complète ;
- la suspension et la reprise de l'écoute sans interruption du match ;
- la lisibilité simultanée des points, jeux, sets et du service ;
- la capitalisation obtenue avec des noms réels contenant accents, apostrophes
  ou traits d'union.
