import type { MatchControllerSnapshot } from '../application/MatchController'
import type { TeamId } from '../core/matchTypes'
import type { PlayerId } from '../core/playerPlusService'
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
  onRequestPlayerServerCorrection?(): void
  onSelectPlayerServer?(playerId: PlayerId): void
  onCancelPlayerServerSelection?(): void
}

export const MATCH_VOICE_COMMAND_HELP = [
  {
    command: 'Score',
    description: 'annonce les points.',
  },
  {
    command: 'Score complet',
    description: 'annonce sets, jeux, points et prochain service.',
  },
  {
    command: 'Annuler',
    description: 'retire la dernière action.',
  },
  {
    command: 'Corriger',
    description: 'permet de rectifier les points du jeu en cours.',
  },
  {
    command: 'Serveur',
    description: 'permet de corriger l’équipe au service.',
  },
  {
    command: 'Fin de match',
    description: 'demande la clôture du match avec confirmation.',
  },
  {
    command: 'Oui',
    description: 'confirme la fin du match.',
  },
  {
    command: 'Non',
    description: 'annule la fin du match.',
  },
  {
    command: 'Termine écoute',
    description: 'suspend la reconnaissance vocale.',
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
  onRequestPlayerServerCorrection,
  onSelectPlayerServer,
  onCancelPlayerServerSelection,
}: MatchScreenProps) {
  const { A, B } = snapshot.display.teams
  const listening = snapshot.conversation.isRunning
  const microphoneClass = `microphone microphone--${snapshot.microphoneStatus}`
  const nextServer = A.isServing ? A : B
  const isPlayerPlus = snapshot.configuration?.mode === 'PLAYERS_PLUS'
  const playerServerName = snapshot.currentPlayerServer?.name
  const selection = snapshot.playerServerSelection
  const duplicateChoiceNames = selection
    ? new Set(selection.choices.map(({ name }) => name)).size <
      selection.choices.length
    : false
  const teamVoiceCommands =
    snapshot.session.state === 'IN_PROGRESS' && snapshot.configuration
      ? [
          {
            command: snapshot.configuration.teamA.voiceName,
            description: `ajoute un point à ${A.name}.`,
          },
          {
            command: snapshot.configuration.teamB.voiceName,
            description: `ajoute un point à ${B.name}.`,
          },
        ]
      : []
  const availableCommandHelp =
    snapshot.session.state === 'FINISHED'
      ? [
          {
            command: 'Nouveau match',
            description: 'revient à la configuration vocale.',
          },
        ]
      : MATCH_VOICE_COMMAND_HELP

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
                onClick={() =>
                  isPlayerPlus
                    ? onRequestPlayerServerCorrection?.()
                    : onServingTeamChange(team.id)
                }
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
        {snapshot.session.state === 'IN_PROGRESS' && (
          <p className="next-server">
            Prochain service{' '}
            <strong>
              {selection
                ? 'Sélection requise'
                : (playerServerName ?? nextServer.name)}
            </strong>
          </p>
        )}
      </section>

      {selection && (
        <section
          className="player-server-selection"
          aria-labelledby="player-server-selection-title"
        >
          <h2 id="player-server-selection-title">
            Qui sert pour {selection.teamName} ?
          </h2>
          <div>
            {selection.choices.map((choice) => (
              <button
                type="button"
                className="primary"
                key={choice.id}
                onClick={() => onSelectPlayerServer?.(choice.id)}
              >
                {choice.name}
                {duplicateChoiceNames && (
                  <small>
                    {' '}
                    — {choice.side === 'RIGHT' ? 'droite' : 'gauche'}
                  </small>
                )}
              </button>
            ))}
          </div>
          {selection.purpose === 'CORRECTION' && (
            <button type="button" onClick={onCancelPlayerServerSelection}>
              Annuler
            </button>
          )}
        </section>
      )}

      <section className="status-panel" aria-live="polite">
        <p className={microphoneClass}>
          <span aria-hidden="true">●</span>{' '}
          {snapshot.microphoneStatus === 'listening'
            ? 'Microphone en écoute'
            : snapshot.microphoneStatus === 'starting'
              ? 'Préparation du microphone'
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

      <details className="voice-command-help">
        <summary>Consignes vocales</summary>
        <dl>
          {[...teamVoiceCommands, ...availableCommandHelp].map(
            ({ command, description }) => (
              <div key={command}>
                <dt>{command}</dt>
                <dd>{description}</dd>
              </div>
            ),
          )}
        </dl>
      </details>

      <section className="controls" aria-label="Commandes de secours">
        <button
          type="button"
          onClick={() => onPoint('A')}
          disabled={snapshot.phase !== 'match'}
        >
          Point équipe A
        </button>
        <button
          type="button"
          onClick={() => onPoint('B')}
          disabled={snapshot.phase !== 'match'}
        >
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
        {isPlayerPlus && (
          <button type="button" onClick={onRequestPlayerServerCorrection}>
            Serveur
          </button>
        )}
        <button
          type="button"
          onClick={onToggleListening}
          disabled={!snapshot.recognitionAvailable}
        >
          {listening ? 'Désactiver l’écoute' : 'Réactiver l’écoute'}
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
