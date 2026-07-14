import { Fragment, useState } from 'react'
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
import {
  ArrowLeftRightIcon,
  MicrophoneIcon,
  PencilIcon,
  PlayerIcon,
  PlayIcon,
  SwapIcon,
  TeamIcon,
} from './Icons'

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
  onCancelDictation(): void
  onStartPlayerMatch(feedbackMode: FeedbackMode): void
  onStartPlayerPlusMatch(feedbackMode: FeedbackMode): void
}

type TeamKey = 'teamA' | 'teamB'

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
  onCancelDictation,
  onStartPlayerMatch,
  onStartPlayerPlusMatch,
}: MatchSetupProps) {
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('BEEP')
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerId | null>(null)
  const [renamingTeam, setRenamingTeam] = useState<TeamKey | null>(null)
  const playerReady = isPlayerConfigurationReady(configuration)
  const playerPlusReady = isPlayerPlusConfigurationReady(
    playerPlusConfiguration,
  )
  const validationMessage =
    mode === 'PLAYER'
      ? validatePlayerSetup(configuration)
      : validatePlayerPlusSetup(playerPlusConfiguration)

  const commandField = (
    teamKey: TeamKey,
    teamNumber: number,
    value: string,
    onChange: (value: string) => void,
  ) => {
    const field = `${teamKey}.voiceName` as SetupDictationField
    const isListening = dictationField === field
    const inputId = `${mode.toLowerCase()}-${teamKey}-voice-name`
    return (
      <div className="command-field command-field--compact">
        <label htmlFor={inputId}>Commande</label>
        <div className="command-input-shell">
          <input
            id={inputId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            className={`field-action field-action--microphone${isListening ? ' field-action--active' : ''}`}
            type="button"
            disabled={dictationField !== null && !isListening}
            onClick={() =>
              isListening ? onCancelDictation() : onDictate(field)
            }
            aria-label={
              isListening
                ? `Annuler la dictée de la commande de l’équipe ${teamNumber}`
                : `Dicter la commande de l’équipe ${teamNumber}`
            }
            aria-pressed={isListening}
          >
            <MicrophoneIcon />
          </button>
        </div>
      </div>
    )
  }

  const updatePlayerTeam = (
    teamKey: TeamKey,
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

  const teamHeading = (
    teamKey: TeamKey,
    name: string,
    teamNumber: number,
    subtitle: string,
  ) => (
    <div className="quick-team-heading">
      <span className="team-avatar" aria-hidden="true">
        <TeamIcon />
      </span>
      <div className="quick-team-title">
        <h3>{name || `Équipe ${teamNumber}`}</h3>
        <span>{subtitle}</span>
      </div>
      <button
        className="icon-button"
        type="button"
        onClick={() =>
          setRenamingTeam((current) => (current === teamKey ? null : teamKey))
        }
        aria-label={`Renommer ${name || `l’équipe ${teamNumber}`}`}
        aria-expanded={renamingTeam === teamKey}
      >
        <PencilIcon />
      </button>
    </div>
  )

  return (
    <section
      className="quick-setup court-surface"
      aria-labelledby="setup-title"
    >
      <header className="quick-setup-header">
        <h2 id="setup-title">Configurer le match</h2>
        <fieldset className="quick-mode-selector">
          <legend className="sr-only">Mode de jeu</legend>
          <button
            type="button"
            aria-pressed={mode === 'PLAYER'}
            onClick={() => onModeChange('PLAYER')}
          >
            PLAYER
          </button>
          <button
            type="button"
            aria-pressed={mode === 'PLAYERS_PLUS'}
            onClick={() => onModeChange('PLAYERS_PLUS')}
          >
            PLAYER+
          </button>
        </fieldset>
      </header>

      <div className="quick-team-list">
        {mode === 'PLAYER'
          ? (['teamA', 'teamB'] as const).map((teamKey, index) => {
              const team = configuration[teamKey]
              return (
                <article className="quick-team" key={teamKey}>
                  {teamHeading(
                    teamKey,
                    team.displayName,
                    index + 1,
                    'Nom de l’équipe',
                  )}
                  {renamingTeam === teamKey && (
                    <label className="compact-edit-field">
                      Nom facultatif
                      <input
                        autoFocus
                        value={team.displayName}
                        placeholder={`Équipe ${index + 1}`}
                        onChange={(event) =>
                          updatePlayerTeam(
                            teamKey,
                            'displayName',
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  )}
                  {commandField(teamKey, index + 1, team.voiceName, (value) =>
                    updatePlayerTeam(teamKey, 'voiceName', value),
                  )}
                </article>
              )
            })
          : (['teamA', 'teamB'] as const).map((teamKey, teamIndex) => {
              const team = playerPlusConfiguration[teamKey]
              const orderedPlayers = [...team.players].sort((left) =>
                left.side === 'LEFT' ? -1 : 1,
              )
              return (
                <Fragment key={teamKey}>
                  <article className="quick-team">
                    {teamHeading(
                      teamKey,
                      team.displayName,
                      teamIndex + 1,
                      team.customDisplayName
                        ? 'Nom personnalisé'
                        : 'Nom automatique',
                    )}
                    {renamingTeam === teamKey && (
                      <label className="compact-edit-field">
                        Nom facultatif
                        <input
                          autoFocus
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
                    )}
                    <div className="player-slot-list">
                      {orderedPlayers.map((player) => {
                        const playerIndex = team.players.findIndex(
                          ({ id }) => id === player.id,
                        )
                        const field =
                          `${teamKey}.${playerIndex === 0 ? 'player1' : 'player2'}` as SetupDictationField
                        const sideLabel =
                          player.side === 'LEFT' ? 'GAUCHE' : 'DROITE'
                        return (
                          <section
                            className={`player-slot${selectedPlayer === player.id ? ' player-slot--selected' : ''}`}
                            key={player.id}
                          >
                            <label htmlFor={`player-${player.id}`}>
                              {sideLabel}
                            </label>
                            <div className="player-input-shell">
                              <PlayerIcon className="player-field-icon" />
                              <input
                                id={`player-${player.id}`}
                                aria-label={`${sideLabel === 'GAUCHE' ? 'Gauche' : 'Droite'} équipe ${teamIndex + 1}`}
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
                              <button
                                className={`field-action field-action--swap${selectedPlayer === player.id ? ' field-action--active' : ''}`}
                                type="button"
                                onClick={() => choosePlayer(player.id)}
                                aria-label={`Sélectionner ${player.name || `le joueur ${sideLabel.toLowerCase()}`} pour un échange`}
                                aria-pressed={selectedPlayer === player.id}
                              >
                                <SwapIcon />
                              </button>
                              <button
                                className={`field-action field-action--microphone${dictationField === field ? ' field-action--active' : ''}`}
                                type="button"
                                disabled={dictationField !== null}
                                onClick={() => onDictate(field)}
                                aria-label={`Dicter le prénom ${sideLabel.toLowerCase()}`}
                              >
                                <MicrophoneIcon />
                              </button>
                            </div>
                          </section>
                        )
                      })}
                    </div>
                    <div className="quick-team-tools">
                      {commandField(
                        teamKey,
                        teamIndex + 1,
                        team.voiceName,
                        (value) =>
                          onPlayerPlusConfigurationChange({
                            ...playerPlusConfiguration,
                            [teamKey]: { ...team, voiceName: value },
                          }),
                      )}
                    </div>
                  </article>
                  <div
                    className={`team-side-action${teamIndex === 1 ? ' team-side-action--last' : ''}`}
                  >
                    <span aria-hidden="true" />
                    <button
                      className="compact-action"
                      type="button"
                      onClick={() =>
                        onPlayerPlusConfigurationChange(
                          swapPlayerSides(
                            playerPlusConfiguration,
                            teamKey === 'teamA' ? 'A' : 'B',
                          ),
                        )
                      }
                      aria-label={`Inverser gauche et droite pour l’équipe ${teamIndex + 1}`}
                    >
                      <ArrowLeftRightIcon />
                      Inverser gauche et droite
                    </button>
                    <span aria-hidden="true" />
                  </div>
                </Fragment>
              )
            })}
      </div>

      {selectedPlayer && (
        <p className="setup-hint" role="status">
          Sélectionnez un autre emplacement pour échanger les joueurs.
        </p>
      )}
      {(message || validationMessage) && (
        <p className="error setup-feedback" role="alert">
          {message || validationMessage}
        </p>
      )}
      <footer className="quick-setup-footer">
        <div>
          {(mode === 'PLAYER' ? playerReady : playerPlusReady) && (
            <p className="configuration-ready" role="status">
              <span aria-hidden="true" /> Configuration prête
            </p>
          )}
          <label className="feedback-choice">
            <span>Feedback</span>
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
        </div>
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
          <PlayIcon />
          Démarrer le match
        </button>
      </footer>
      {microphoneStatus === 'error' && (
        <p className="error">La saisie vocale ciblée est indisponible.</p>
      )}
    </section>
  )
}
