# PADEL SCORE

Assistant vocal de score pour le padel, conçu pour réduire la charge mentale des joueurs.

> « Vous jouez. Le système se souvient. »

## Statut actuel

Task 001 : fondation technique et documentaire uniquement. L’application affiche une page d’attente minimale et ne permet pas encore de jouer un match.

## Prérequis

- Node.js 20.19 ou version ultérieure ;
- npm 10 ou version ultérieure ;
- un navigateur web récent.

## Installation

```bash
npm install
```

## Lancement

```bash
npm run dev
```

Ouvrir ensuite l’adresse locale indiquée par Vite dans le navigateur.

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

## Structure du projet

```text
docs/             Vision, décisions, roadmap et architecture
src/core/         Règles et moteur de score futurs, sans React
src/application/  Orchestration future des cas d’usage
src/ui/           Affichage et interactions futurs
src/voice/        Reconnaissance et synthèse vocales futures
src/App.tsx       Interface temporaire
src/main.tsx      Point d’entrée React
```

## Fonctionnalités volontairement absentes

- moteur de score ;
- reconnaissance vocale ;
- synthèse vocale ;
- interface métier avancée ;
- persistance ;
- backend.
