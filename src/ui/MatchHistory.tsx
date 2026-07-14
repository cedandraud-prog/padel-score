import type { MatchRecord } from '../application/matchPersistence'

interface MatchHistoryProps {
  records: readonly MatchRecord[]
  onOpen(record: MatchRecord): void
  onClose(): void
}

export function MatchHistory({ records, onOpen, onClose }: MatchHistoryProps) {
  return (
    <section
      className="persistence-card history"
      aria-labelledby="history-title"
    >
      <div className="history-heading">
        <h2 id="history-title">Historique des matchs</h2>
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
      {records.length === 0 ? (
        <p>Aucun match enregistré sur ce téléphone.</p>
      ) : (
        <ul className="history-list">
          {records.map((record) => (
            <li key={record.id}>
              <button type="button" onClick={() => onOpen(record)}>
                <strong>
                  {record.configuration.teamA.displayName} —{' '}
                  {record.configuration.teamB.displayName}
                </strong>
                <span>
                  {record.finalScore.sets.A}–{record.finalScore.sets.B} ·{' '}
                  {record.completedSets
                    .map((set) => `${set.A}–${set.B}`)
                    .join(' / ') || 'set en cours'}
                </span>
                <span>
                  {new Date(record.closedAt).toLocaleDateString('fr-FR')} ·{' '}
                  {record.status === 'FINISHED' ? 'Terminé' : 'Abandonné'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
