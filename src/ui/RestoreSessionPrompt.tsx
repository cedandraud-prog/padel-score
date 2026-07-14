import type { MatchSessionSnapshot } from '../application/matchPersistence'

interface RestoreSessionPromptProps {
  session: MatchSessionSnapshot
  busy?: boolean
  onResume(): void
  onAbandon(): void
}

export function RestoreSessionPrompt({
  session,
  busy = false,
  onResume,
  onAbandon,
}: RestoreSessionPromptProps) {
  return (
    <section className="persistence-card" aria-labelledby="restore-title">
      <p className="eyebrow">Sauvegarde locale</p>
      <h2 id="restore-title">Match en cours retrouvé</h2>
      <p>
        {session.configuration.teamA.displayName} —{' '}
        {session.configuration.teamB.displayName}
      </p>
      <div className="persistence-actions">
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={onResume}
        >
          Reprendre
        </button>
        <button type="button" disabled={busy} onClick={onAbandon}>
          Abandonner
        </button>
      </div>
    </section>
  )
}
