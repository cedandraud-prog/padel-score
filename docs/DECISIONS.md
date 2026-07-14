# Registre des décisions

Ce document conserve les décisions validées. Chaque nouvelle décision reçoit une date, un statut et un identifiant afin que le registre reste extensible et traçable.

## 2026-07-12 — Principes d’interaction

Statut : validé

- **DEC-001** — Le système n’utilise pas de caméra.
- **DEC-002** — Aucune montre n’est obligatoire.
- **DEC-003** — Aucun geste n’est nécessaire pendant le jeu.
- **DEC-004** — Un joueur est désigné comme scoreur.
- **DEC-005** — Les équipes peuvent avoir des noms personnalisés.
- **DEC-006** — Prononcer le nom de l’équipe gagnante ajoute un point à cette équipe.
- **DEC-007** — « Score » demande l’annonce du score actuel.
- **DEC-008** — « Annule » annule la dernière action.
- **DEC-009** — « Corrige » déclenche explicitement la correction des points.
- **DEC-010** — Les annonces ordinaires des joueurs ne doivent jamais être interprétées comme des corrections.
- **DEC-011** — Les jeux et les sets ne sont corrigés que sur demande explicite.

## 2026-07-12 — Expérience et expérimentation

Statut : validé

- **DEC-012** — L’affichage s’inspire des tableaux de score du tennis.
- **DEC-013** — Le premier test utilise le PC portable, le casque Bluetooth et l’enceinte Bluetooth de Cédric.
- **DEC-014** — Aucune fonctionnalité ne doit être développée sans hypothèse à tester.

## 2026-07-14 — Progression PLAYER / PLAYER+

Statut : validé techniquement et sur la Preview PWA

- **DEC-015** — PLAYER reste le mode stable et opérationnel ; les évolutions
  PLAYER+ ne doivent pas le faire régresser.
- **DEC-016** — PLAYER+ peut être sélectionné et configuré, mais reste non
  démarrable avec la mention « Bientôt disponible » tant qu’il n’est pas relié
  au moteur.
- **DEC-017** — Le `ScoreEngine` est l’unique source de vérité du service PLAYER.
  `ServiceState` appartient à `MatchState`, les corrections sont historisées et
  `undo()` restaure leur état précédent.
- **DEC-018** — La variabilité de transcription selon les conditions réseau est
  une contrainte terrain connue. Aucun correctif n’est engagé sans cause
  déterministe observée.
- **DEC-019** — Les travaux restent conduits sur `test/task-016-pwa` ; `main`
  demeure la version stable de production.

## 2026-07-14 — Ordre initial du service PLAYER+

Statut : validé techniquement et sur la Preview PWA

- **DEC-020** — `A1`, `A2`, `B1` et `B2` sont les identifiants canoniques des
  participants PLAYER+. Les noms peuvent être identiques et ne déterminent
  jamais l’identité.
- **DEC-021** — L’ordre du premier set est déterminé progressivement : serveur
  du premier jeu, puis serveur adverse au deuxième jeu, puis partenaires dans
  les deux positions restantes. L’ordre est ensuite figé pour le set.
- **DEC-022** — Les côtés `RIGHT` et `LEFT` restent indépendants de l’ordre de
  service.
- **DEC-023** — Le contrat validé par TASK-018.1 reste déconnecté du
  `ScoreEngine`. Il n’active ni démarrage, ni rotation, ni tie-break, ni
  correction individuelle PLAYER+.
