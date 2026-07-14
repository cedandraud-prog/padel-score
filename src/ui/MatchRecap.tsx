import type { MatchRecord } from '../application/matchPersistence'

interface MatchRecapProps {
  record: MatchRecord
  onResume(): void
  onNewWithPlayers(): void
  onBackToSetup(): void
}

export function MatchRecap({
  record,
  onResume,
  onNewWithPlayers,
  onBackToSetup,
}: MatchRecapProps) {
  const durationMinutes = Math.max(0, Math.round(record.durationMs / 60_000))
  return (
    <section className="persistence-card recap" aria-labelledby="recap-title">
      <p className="eyebrow">
        {record.status === 'FINISHED' ? 'Match terminé' : 'Match abandonné'}
      </p>
      <h2 id="recap-title">
        {record.configuration.teamA.displayName} —{' '}
        {record.configuration.teamB.displayName}
      </h2>
      <p className="recap-score">
        {record.finalScore.sets.A} — {record.finalScore.sets.B}
      </p>
      <ol className="set-history" aria-label="Scores des sets">
        {record.completedSets.map((set, index) => (
          <li key={`${index}-${set.A}-${set.B}`}>
            Set {index + 1} : {set.A}–{set.B}
          </li>
        ))}
        {(record.finalScore.games.A > 0 || record.finalScore.games.B > 0) && (
          <li>
            Set en cours : {record.finalScore.games.A}–
            {record.finalScore.games.B}
          </li>
        )}
      </ol>
      <p>
        {new Date(record.closedAt).toLocaleString('fr-FR')} · {durationMinutes}{' '}
        min
      </p>
      <div className="persistence-actions">
        <button className="primary" type="button" onClick={onResume}>
          Reprendre le match
        </button>
        <button type="button" onClick={onNewWithPlayers}>
          Nouveau match avec ces joueurs
        </button>
        <button type="button" onClick={onBackToSetup}>
          Retour à la configuration
        </button>
      </div>
    </section>
  )
}
