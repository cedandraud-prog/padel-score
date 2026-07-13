# Roadmap

- **Task 001** — Fondation du projet.
- **Task 002** — Moteur de score.
- **Task 003** — MLP de comptage vocal sur PC.
- **Task 004** — Configuration de match manuelle ou vocale.
- **Task 006** — Session de jeu et format FREE_PLAY.
- **Task 007** — Nom d’équipe unique et indice de connexion Chrome.
- **Task 007.1** — Nom affiché et consigne vocale distincts avec parcours direct.
- **ADR-011 / US-006** — Modes PLAYER et PLAYER+, positions droite/gauche,
  saisie vocale ou clavier et politiques de service distinctes.
- **CAMP-001** — Validation de l’expérience pendant un vrai match.

## Trajectoire produit

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

PADEL SCORE privilégie d’abord le matériel déjà possédé par le joueur. Un matériel propriétaire ne sera envisagé que comme option premium, après validation terrain.

## Trajectoire multisport

```text
Consolider le vertical padel
  ↓
Définir complètement le modèle tennis
  ↓
Comparer padel et tennis
  ↓
Extraire les abstractions réellement communes
  ↓
Implémenter la sélection multisport si elle est alors pertinente
```

Cette trajectoire ne crée aucune Task d’implémentation multisport immédiate. Les tests terrain du padel restent prioritaires et le moteur actuel ne sera pas généralisé avant la comparaison des deux modèles.
