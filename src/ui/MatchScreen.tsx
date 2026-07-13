import type { MatchControllerSnapshot } from '../application/MatchController'
import type { TeamId } from '../core/matchTypes'
import { EditableDisplayName } from './EditableDisplayName'

interface MatchScreenProps {
  snapshot: MatchControllerSnapshot
  onPoint(team: TeamId): void
  onUndo(): void
  onScore(): void
  onFullScore(): void
  onCorrect(): void
  onToggleListening(): void
  onNewMatch(): void
  onDisplayNameChange(team: TeamId, value: string): void
  onServingTeamChange(team: TeamId): void
}

export const MATCH_VOICE_COMMAND_HELP = [
  {
    command: 'Annuler',
    description: 'retire la dernière action.',
  },
  {
    command: 'Corriger',
    description: 'permet de rectifier les points du jeu en cours.',
  },
  {
    command: 'Fin de match',
    description: 'demande la clôture du match avec confirmation.',
  },
] as const

export function MatchScreen({
  snapshot,
  onPoint,
  onUndo,
  onScore,
  onFullScore,
  onCorrect,
  onToggleListening,
  onNewMatch,
  onDisplayNameChange,
  onServingTeamChange,
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
            <div className="team-identity">
              <button
                className={`server-control${team.isServing ? ' server-control--active' : ''}`}
                type="button"
                onClick={() => onServingTeamChange(team.id)}
                disabled={snapshot.session.state !== 'IN_PROGRESS'}
                aria-label={
                  team.isServing
                    ? `${team.name} est au service`
                    : `Donner le service à ${team.name}`
                }
                aria-pressed={team.isServing}
              >
                <span aria-hidden="true">●</span>
              </button>
              <EditableDisplayName
                value={team.name}
                teamLabel={team.name}
                onSave={(value) => onDisplayNameChange(team.id, value)}
              />
            </div>
            <span className="score-value" aria-label={`${team.sets} sets`}>
              {team.sets}
            </span>
            <span className="score-value" aria-label={`${team.games} jeux`}>
              {team.games}
            </span>
            <span className="points" aria-label={`${team.points} points`}>
              {team.points}
            </span>
          </div>
        ))}
        {snapshot.display.isTieBreak && <p className="badge">Tie-break</p>}
        {snapshot.display.winner &&
          snapshot.session.state !== 'IN_PROGRESS' && (
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

      <section className="voice-command-guide" aria-label="Commandes vocales">
        <span>À la voix</span>
        <ul>
          {MATCH_VOICE_COMMAND_HELP.map(({ command }) => (
            <li key={command}>{command}</li>
          ))}
        </ul>
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
        {snapshot.phase === 'session-finished' && (
          <button type="button" className="primary" onClick={onNewMatch}>
            Nouveau match
          </button>
        )}
      </section>
    </>
  )
}
