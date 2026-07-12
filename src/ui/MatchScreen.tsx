import type { MatchControllerSnapshot } from '../application/MatchController'
import type { TeamId } from '../core/matchTypes'
import { VoiceDiagnostics } from './VoiceDiagnostics'

interface MatchScreenProps {
  snapshot: MatchControllerSnapshot
  onPoint(team: TeamId): void
  onUndo(): void
  onScore(): void
  onFullScore(): void
  onCorrect(): void
  onToggleListening(): void
  onNewMatch(): void
}

export function MatchScreen({
  snapshot,
  onPoint,
  onUndo,
  onScore,
  onFullScore,
  onCorrect,
  onToggleListening,
  onNewMatch,
}: MatchScreenProps) {
  const { A, B } = snapshot.display.teams
  const listening = snapshot.microphoneStatus === 'listening'
  const microphoneClass = `microphone microphone--${snapshot.microphoneStatus}`

  return (
    <>
      <section className="scoreboard" aria-label="Score du match">
        <div className="scoreboard-header" aria-hidden="true">
          <span>Équipe</span>
          <span>Sets</span>
          <span>Jeux</span>
          <span>Points</span>
        </div>
        {[A, B].map((team) => (
          <div
            className={`team-row${team.isWinner ? ' team-row--winner' : ''}`}
            key={team.id}
          >
            <strong>
              {team.isServing && <span title="Au service">● </span>}
              {team.name}
            </strong>
            <span>{team.sets}</span>
            <span>{team.games}</span>
            <span className="points">{team.points}</span>
          </div>
        ))}
        {snapshot.display.isTieBreak && <p className="badge">Tie-break</p>}
        {snapshot.display.winner && (
          <p className="winner" role="status">
            Victoire de {snapshot.display.teams[snapshot.display.winner].name}
          </p>
        )}
      </section>

      <section className="status-panel" aria-live="polite">
        <p className={microphoneClass}>
          <span aria-hidden="true">●</span>{' '}
          {snapshot.microphoneStatus === 'listening'
            ? 'Microphone en écoute'
            : snapshot.microphoneStatus === 'starting'
              ? 'Démarrage de l’écoute'
              : snapshot.microphoneStatus === 'speaking'
                ? 'Annonce en cours — écoute suspendue'
                : snapshot.microphoneStatus === 'unavailable'
                  ? 'Reconnaissance indisponible'
                  : snapshot.microphoneStatus === 'error'
                    ? 'Erreur microphone'
                    : 'Microphone désactivé'}
        </p>
        {snapshot.message && (
          <p className="message" role="alert">
            {snapshot.message}
          </p>
        )}
      </section>

      <section className="controls" aria-label="Commandes de secours">
        <button type="button" onClick={() => onPoint('A')}>
          Point équipe A
        </button>
        <button type="button" onClick={() => onPoint('B')}>
          Point équipe B
        </button>
        <button type="button" onClick={onUndo}>
          Annuler
        </button>
        <button type="button" onClick={onScore}>
          Score
        </button>
        <button type="button" onClick={onFullScore}>
          Score complet
        </button>
        <button type="button" onClick={onCorrect}>
          Corriger
        </button>
        <button
          type="button"
          onClick={onToggleListening}
          disabled={
            !snapshot.recognitionAvailable || snapshot.phase === 'finished'
          }
        >
          {listening ? 'Désactiver l’écoute' : 'Activer l’écoute'}
        </button>
        {snapshot.phase === 'finished' && (
          <button type="button" className="primary" onClick={onNewMatch}>
            Nouveau match
          </button>
        )}
      </section>

      <VoiceDiagnostics snapshot={snapshot} />
    </>
  )
}
