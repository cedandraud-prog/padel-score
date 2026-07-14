import type { PlayerMatchConfiguration } from '../application/matchConfiguration'
import type { PlayerPlusConfigurationDraft } from '../application/setupConfiguration'
import type { TeamId } from '../core/matchTypes'
import type { PlayerId } from '../core/playerPlusService'
import { normalizeSpeech } from '../voice/normalizeSpeech'

interface InitialServerSelectionProps {
  mode: 'PLAYER' | 'PLAYERS_PLUS'
  playerConfiguration: PlayerMatchConfiguration
  playerPlusConfiguration: PlayerPlusConfigurationDraft
  listening: boolean
  message: string
  onSelectTeam(team: TeamId): void
  onSelectPlayer(player: PlayerId): void
  onListen(): void
  onCancel(): void
}

export function InitialServerSelection({
  mode,
  playerConfiguration,
  playerPlusConfiguration,
  listening,
  message,
  onSelectTeam,
  onSelectPlayer,
  onListen,
  onCancel,
}: InitialServerSelectionProps) {
  const players = [
    ...playerPlusConfiguration.teamA.players,
    ...playerPlusConfiguration.teamB.players,
  ]
  const homonyms = new Set(
    players
      .filter(
        (player, index) =>
          players.findIndex(
            ({ name }) =>
              normalizeSpeech(name) === normalizeSpeech(player.name),
          ) !== index,
      )
      .map(({ name }) => normalizeSpeech(name)),
  )

  return (
    <section className="initial-server" aria-labelledby="initial-server-title">
      <h2 id="initial-server-title">
        {mode === 'PLAYER'
          ? 'Quelle équipe sert en premier ?'
          : 'Quel joueur sert en premier ?'}
      </h2>
      {mode === 'PLAYER' ? (
        <div className="initial-server-choices">
          <button
            className="primary"
            type="button"
            onClick={() => onSelectTeam('A')}
          >
            {playerConfiguration.teamA.displayName || 'Équipe 1'}
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => onSelectTeam('B')}
          >
            {playerConfiguration.teamB.displayName || 'Équipe 2'}
          </button>
        </div>
      ) : (
        <div className="initial-server-teams">
          {(['teamA', 'teamB'] as const).map((teamKey) => {
            const team = playerPlusConfiguration[teamKey]
            return (
              <article key={teamKey}>
                <h3>{team.displayName}</h3>
                {team.players.map((player) => (
                  <button
                    className="primary"
                    type="button"
                    key={player.id}
                    onClick={() => onSelectPlayer(player.id)}
                  >
                    {player.name}
                    {homonyms.has(normalizeSpeech(player.name)) && (
                      <small>
                        {' '}
                        — {player.side === 'LEFT' ? 'gauche' : 'droite'}
                      </small>
                    )}
                  </button>
                ))}
              </article>
            )
          })}
        </div>
      )}
      <button type="button" disabled={listening} onClick={onListen}>
        {listening ? 'Écoute en cours…' : 'Répondre à la voix'}
      </button>
      {message && <p className="error">{message}</p>}
      <button type="button" onClick={onCancel}>
        Retour à la configuration
      </button>
    </section>
  )
}
