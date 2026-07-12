# PADEL SCORE

Assistant vocal de score pour le padel, conçu pour réduire la charge mentale des joueurs.

> « Vous jouez. Le système se souvient. »

## Statut actuel

TASK-003 : MLP de comptage vocal sur PC, destiné à valider l’expérience pendant un vrai match. Ce logiciel est un moyen de test ; il ne représente pas le tableau sportif final.

## Prérequis

- Node.js 20.19 ou version ultérieure ;
- npm 10 ou version ultérieure ;
- Google Chrome récent sur Windows pour la reconnaissance vocale ;
- un microphone, idéalement un casque Bluetooth ;
- une sortie audio, idéalement une enceinte Bluetooth.

## Installation

```bash
npm install
```

## Lancement

```bash
npm run dev
```

Ouvrir ensuite l’adresse locale indiquée par Vite dans le navigateur.

## Utilisation du MLP vocal

### Préparer Windows

1. Connecter le casque et l’enceinte Bluetooth.
2. Dans les paramètres audio Windows, sélectionner le casque Bluetooth comme périphérique d’entrée.
3. Sélectionner l’enceinte Bluetooth comme périphérique de sortie.
4. Vérifier les niveaux d’entrée et de sortie avant d’ouvrir le match.

### Démarrer un match

1. Ouvrir l’application avec Google Chrome.
2. Autoriser l’accès au microphone lorsque Chrome le demande.
3. Saisir les deux noms affichés et leurs identifiants vocaux (Alpha et Bravo par défaut), ou sélectionner **Configurer à la voix**.
4. Choisir l’équipe au service.
5. Choisir le feedback de commande : bip court, voix « OK » ou aucun.
6. Sélectionner **Démarrer le match**.

Les identifiants vocaux sont comparés exactement après normalisation. Ils doivent être distincts, courts et ne pas correspondre à une commande réservée.

### Commandes vocales

- identifiant vocal exact de l’équipe A ou B : attribuer un point et annoncer le score ;
- `Score` : annoncer uniquement les points sans modifier le score ;
- `Score complet` : annoncer les sets, les jeux et les points ;
- `Annule` : annuler la dernière action ;
- `Corrige` / `Corriger` / `Corrigez` : demander vocalement un nouveau score de points ;
- `Corrige 30 30` : appliquer immédiatement une correction de points en une phrase ;
- `Termine écoute` : arrêter volontairement la reconnaissance.
- `Fin de match` : demander la clôture manuelle de la session, puis `Confirmer` ou `Annuler` ;
- `Nouveau match` : lancer directement la configuration vocale lorsqu’aucune session n’est en cours.

Le MLP utilise le format `FREE_PLAY` : les sets continuent sans limite et seule la commande confirmée `Fin de match` clôture la session.

`Reprends écoute` est réservé mais ne peut pas être entendu lorsque l’écoute est coupée. Utiliser le bouton **Activer l’écoute** sur le PC.

Les boutons restent disponibles pour compter, annuler, demander le score, corriger et gérer l’écoute lorsque la reconnaissance est indisponible ou peu fiable.

Le feedback est joué uniquement pour une commande vocale finale, valide et réellement exécutable. Une même commande déjà exécutée puis reçue à nouveau dans les 1 500 ms est ignorée sans feedback ni annonce.

### Procédure de test manuel

1. Démarrer l’application avec `npm run dev`.
2. Ouvrir dans Chrome l’adresse affichée par Vite.
3. Autoriser le microphone.
4. Créer deux équipes aux noms phonétiquement distincts.
5. Démarrer le match.
6. Prononcer successivement chaque nom et vérifier l’attribution des points.
7. Prononcer `Score` et vérifier que le score ne change pas.
8. Prononcer `Score complet` et vérifier l’annonce des sets, jeux et points.
9. Prononcer `Annule` et vérifier la restauration du score précédent.
10. Prononcer `Corrige`, attendre « Nouveau score ? », puis prononcer `15 partout`.
11. Vérifier que la reconnaissance est suspendue pendant les annonces et que celles-ci ne sont pas interprétées comme des commandes.
12. Terminer un match simulé avec la voix ou les boutons de secours.
13. Vérifier l’annonce du vainqueur, l’arrêt de l’écoute et la conservation du score final.

## Limites connues du MLP

- la Web Speech API dépend de sa disponibilité dans Chrome et peut nécessiter une connexion réseau ;
- la qualité dépend du microphone, du bruit du terrain et de la prononciation ;
- seules les correspondances exactes après normalisation sont acceptées ;
- les transcriptions dont la confiance exploitable est inférieure à 65 % sont ignorées ; une valeur absente, non finie ou égale à zéro déclenche uniquement la correspondance exacte ;
- la correction vocale concerne uniquement les points ; le formulaire PC reste disponible en secours ;
- la sélection des périphériques audio s’effectue dans Windows, pas dans l’application ;
- aucune persistance : un rechargement de la page perd le match ;
- l’interface est un outil de validation et non le design du tableau sportif final.

## Tests

```bash
npm run test
```

## Build

```bash
npm run build
```

## Qualité du code

```bash
npm run lint
npm run format
npm run format:check
```

## Documentation

- [Principes produit](docs/PRODUCT_PRINCIPLES.md)
- [ADR-004 — Configuration vocale guidée](docs/adr/ADR-004-voice-guided-match-setup.md)

## Structure du projet

```text
docs/             Vision, décisions, roadmap et architecture
src/core/         Règles et moteur de score futurs, sans React
src/application/  Orchestration du match et annonces
src/ui/           Configuration, score, correction et diagnostics
src/voice/        Adaptateurs remplaçables de reconnaissance et synthèse
src/App.tsx       Composition de l’application MLP
src/main.tsx      Point d’entrée React
```

## Fonctionnalités volontairement absentes

- persistance ;
- backend.
- compte utilisateur ;
- dictée vocale des corrections ;
- interface ou architecture matérielle des produits GO et CLUB.
