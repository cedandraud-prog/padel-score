import { useState } from 'react'
import type { MicrophoneStatus } from '../application/MatchController'
import type { PlayerMatchConfiguration } from '../application/matchConfiguration'
import {
  isPlayerConfigurationReady,
  isPlayerPlusConfigurationReady,
  renamePlayerPlusTeam,
  swapPlayerSides,
  swapPlayers,
  updatePlayerName,
  validatePlayerPlusSetup,
  validatePlayerSetup,
  type PlayerPlusConfigurationDraft,
  type SetupDictationField,
  type SetupMode,
} from '../application/setupConfiguration'
import type { PlayerId } from '../core/playerPlusService'
import type { FeedbackMode } from '../voice/speechTypes'

interface MatchSetupProps {
  message: string
  mode: SetupMode
  configuration: PlayerMatchConfiguration
  playerPlusConfiguration: PlayerPlusConfigurationDraft
  microphoneStatus: MicrophoneStatus
  dictationField: SetupDictationField | null
  onModeChange(mode: SetupMode): void
  onConfigurationChange(configuration: PlayerMatchConfiguration): void
  onPlayerPlusConfigurationChange(
    configuration: PlayerPlusConfigurationDraft,
  ): void
  onDictate(field: SetupDictationField): void
  onStartPlayerMatch(feedbackMode: FeedbackMode): void
  onStartPlayerPlusMatch(feedbackMode: FeedbackMode): void
}

export function MatchSetup({
  message,
  mode,
  configuration,
  playerPlusConfiguration,
  microphoneStatus,
  dictationField,
  onModeChange,
  onConfigurationChange,
  onPlayerPlusConfigurationChange,
  onDictate,
  onStartPlayerMatch,
  onStartPlayerPlusMatch,
}: MatchSetupProps) {
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('BEEP')
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerId | null>(null)
  const playerReady = isPlayerConfigurationReady(configuration)
  const playerPlusReady = isPlayerPlusConfigurationReady(
    playerPlusConfiguration,
  )
  const validationMessage =
    mode === 'PLAYER'
      ? validatePlayerSetup(configuration)
      : validatePlayerPlusSetup(playerPlusConfiguration)

  const updatePlayerTeam = (
    teamKey: 'teamA' | 'teamB',
    property: 'displayName' | 'voiceName',
    value: string,
  ) => {
    onConfigurationChange({
      ...configuration,
      [teamKey]: { ...configuration[teamKey], [property]: value },
    })
  }

  const choosePlayer = (playerId: PlayerId) => {
    if (!selectedPlayer) {
      setSelectedPlayer(playerId)
      return
    }
    onPlayerPlusConfigurationChange(
      swapPlayers(playerPlusConfiguration, selectedPlayer, playerId),
    )
    setSelectedPlayer(null)
  }

  return (
    <section className="quick-setup" aria-labelledby="setup-title">
      <header className="quick-setup-header">
        <h2 id="setup-title">Configurer le match</h2>
        <fieldset className="quick-mode-selector">
          <legend className="sr-only">Mode de jeu</legend>
          <label>
            <input
              type="radio"
              name="setup-mode"
              checked={mode === 'PLAYER'}
              onChange={() => onModeChange('PLAYER')}
            />
            PLAYER
          </label>
          <label>
            <input
              type="radio"
              name="setup-mode"
              checked={mode === 'PLAYERS_PLUS'}
              onChange={() => onModeChange('PLAYERS_PLUS')}
            />
            PLAYER+
          </label>
        </fieldset>
      </header>

      {mode === 'PLAYER' ? (
        <div className="quick-team-list">
          {(['teamA', 'teamB'] as const).map((teamKey, index) => (
            <article className="quick-team" key={teamKey}>
              <h3>Équipe {index + 1}</h3>
              <label>
                Nom facultatif
                <input
                  value={configuration[teamKey].displayName}
                  placeholder={`Équipe ${index + 1}`}
                  onChange={(event) =>
                    updatePlayerTeam(teamKey, 'displayName', event.target.value)
                  }
                />
              </label>
              <label>
                Commande
                <input
                  value={configuration[teamKey].voiceName}
                  onChange={(event) =>
                    updatePlayerTeam(teamKey, 'voiceName', event.target.value)
                  }
                />
              </label>
            </article>
          ))}
        </div>
      ) : (
        <div className="quick-team-list">
          {(['teamA', 'teamB'] as const).map((teamKey, teamIndex) => {
            const team = playerPlusConfiguration[teamKey]
            const orderedPlayers = [...team.players].sort((left, right) =>
              left.side === 'LEFT' && right.side === 'RIGHT' ? -1 : 1,
            )
            return (
              <article className="quick-team" key={teamKey}>
                <div className="quick-team-heading">
                  <h3>{team.displayName}</h3>
                  <button
                    type="button"
                    onClick={() =>
                      onPlayerPlusConfigurationChange(
                        swapPlayerSides(
                          playerPlusConfiguration,
                          teamKey === 'teamA' ? 'A' : 'B',
                        ),
                      )
                    }
                  >
                    Inverser gauche et droite
                  </button>
                </div>
                <label className="optional-team-name">
                  Renommer l’équipe
                  <input
                    value={team.customDisplayName ? team.displayName : ''}
                    placeholder="Nom automatique"
                    onChange={(event) =>
                      onPlayerPlusConfigurationChange(
                        renamePlayerPlusTeam(
                          playerPlusConfiguration,
                          teamKey,
                          event.target.value,
                        ),
                      )
                    }
                  />
                </label>
                <div className="player-slot-list">
                  {orderedPlayers.map((player) => {
                    const playerIndex = team.players.findIndex(
                      ({ id }) => id === player.id,
                    )
                    const field =
                      `${teamKey}.${playerIndex === 0 ? 'player1' : 'player2'}` as SetupDictationField
                    return (
                      <section
                        className={`player-slot${selectedPlayer === player.id ? ' player-slot--selected' : ''}`}
                        key={player.id}
                      >
                        <strong>
                          {player.side === 'LEFT' ? 'GAUCHE' : 'DROITE'}
                        </strong>
                        <input
                          aria-label={`${player.side === 'LEFT' ? 'Gauche' : 'Droite'} équipe ${teamIndex + 1}`}
                          value={player.name}
                          placeholder="Prénom du joueur"
                          onChange={(event) =>
                            onPlayerPlusConfigurationChange(
                              updatePlayerName(
                                playerPlusConfiguration,
                                player.id,
                                event.target.value,
                              ),
                            )
                          }
                        />
                        <div>
                          <button
                            type="button"
                            disabled={dictationField !== null}
                            onClick={() => onDictate(field)}
                            aria-label={`Dicter le prénom ${player.side === 'LEFT' ? 'gauche' : 'droite'}`}
                          >
                            {dictationField === field ? 'Écoute…' : 'Micro'}
                          </button>
                          <button
                            type="button"
                            onClick={() => choosePlayer(player.id)}
                          >
                            {selectedPlayer === player.id
                              ? 'Sélectionné'
                              : 'Échanger'}
                          </button>
                        </div>
                      </section>
                    )
                  })}
                </div>
                <label>
                  Commande
                  <input
                    value={team.voiceName}
                    onChange={(event) =>
                      onPlayerPlusConfigurationChange({
                        ...playerPlusConfiguration,
                        [teamKey]: { ...team, voiceName: event.target.value },
                      })
                    }
                  />
                </label>
              </article>
            )
          })}
        </div>
      )}

      {selectedPlayer && (
        <p className="setup-hint" role="status">
          Sélectionnez un autre emplacement pour échanger les joueurs.
        </p>
      )}
      {(message || validationMessage) && (
        <p className="error" role="alert">
          {message || validationMessage}
        </p>
      )}
      {(mode === 'PLAYER' ? playerReady : playerPlusReady) && (
        <p className="configuration-ready" role="status">
          Configuration prête
        </p>
      )}
      <label className="feedback-choice">
        Feedback après commande
        <select
          value={feedbackMode}
          onChange={(event) =>
            setFeedbackMode(event.target.value as FeedbackMode)
          }
        >
          <option value="BEEP">Bip court</option>
          <option value="OK">Voix OK</option>
          <option value="NONE">Aucun</option>
        </select>
      </label>
      <button
        className="setup-start-match primary"
        type="button"
        disabled={mode === 'PLAYER' ? !playerReady : !playerPlusReady}
        onClick={() =>
          mode === 'PLAYER'
            ? onStartPlayerMatch(feedbackMode)
            : onStartPlayerPlusMatch(feedbackMode)
        }
      >
        Démarrer le match
      </button>
      {microphoneStatus === 'error' && (
        <p className="error">La saisie vocale ciblée est indisponible.</p>
      )}
    </section>
  )
}
