import { useState, type FormEvent } from 'react'
import type { MicrophoneStatus } from '../application/MatchController'
import {
  validateDisplayName,
  validateVoiceName,
  type PlayerMatchConfiguration,
} from '../application/matchConfiguration'
import {
  applyPlayerPlusDictation,
  isPlayerConfigurationReady,
  toPlayerPlusMatchConfiguration,
  SETUP_FIELD_LABELS,
  type PlayerPlusConfigurationDraft,
  type PlayerSide,
  type SetupDictationField,
  type SetupDictationTrace,
  type SetupMode,
} from '../application/setupConfiguration'
import type {
  VoiceMatchSetupSnapshot,
  VoiceSetupEditedField,
} from '../application/VoiceMatchSetup'
import type { FeedbackMode } from '../voice/speechTypes'
import { matchesControlledResponse } from '../voice/controlledResponseAliases'

type PlayerEditField = VoiceSetupEditedField

type PlayerPlusEditField =
  SetupDictationField | 'teamA.positions' | 'teamB.positions'

type SetupEditTarget =
  | { mode: 'PLAYER'; field: PlayerEditField }
  | { mode: 'PLAYERS_PLUS'; field: PlayerPlusEditField }

interface MatchSetupProps {
  message: string
  mode: SetupMode
  configuration: PlayerMatchConfiguration
  playerPlusConfiguration: PlayerPlusConfigurationDraft
  voiceSetup: VoiceMatchSetupSnapshot | null
  microphoneStatus: MicrophoneStatus
  dictationField: SetupDictationField | null
  nextMissingField: SetupDictationField | null
  dictationTrace: SetupDictationTrace | null
  showDictationDiagnostics: boolean
  onModeChange(mode: SetupMode): void
  onConfigurationChange(
    configuration: PlayerMatchConfiguration,
    editedField: VoiceSetupEditedField,
  ): void
  onPlayerPlusConfigurationChange(
    configuration: PlayerPlusConfigurationDraft,
  ): void
  onDictate(field: SetupDictationField): void
  onEditStateChange(editing: boolean): void
  onRestartConfiguration(): void
  onStartPlayerMatch(feedbackMode: FeedbackMode): void
  onStartPlayerPlusMatch(feedbackMode: FeedbackMode): void
}

const microphoneLabels: Record<MicrophoneStatus, string> = {
  inactive: 'En attente',
  starting: 'Activation de l’écoute…',
  listening: 'Écoute active',
  speaking: 'Annonce en cours',
  disabled: 'Écoute suspendue pendant la modification',
  unavailable: 'Écoute indisponible',
  error: 'Écoute interrompue',
}

const playerEditLabels: Record<PlayerEditField, string> = {
  'teamA.displayName': 'Nom de l’équipe 1',
  'teamA.voiceName': 'Consigne vocale de l’équipe 1',
  'teamB.displayName': 'Nom de l’équipe 2',
  'teamB.voiceName': 'Consigne vocale de l’équipe 2',
  servingTeam: 'Équipe au service',
}

function playerPlusQuestion(field: SetupDictationField | null): string {
  const questions: Record<SetupDictationField, string> = {
    'teamA.displayName': 'Quel est le nom de la première équipe ?',
    'teamA.player1': 'Quel est le nom du premier joueur de l’équipe 1 ?',
    'teamA.player2': 'Quel est le nom du deuxième joueur de l’équipe 1 ?',
    'teamA.voiceName': 'Quelle consigne vocale pour cette équipe ?',
    'teamB.displayName': 'Quel est le nom de la deuxième équipe ?',
    'teamB.player1': 'Quel est le nom du premier joueur de l’équipe 2 ?',
    'teamB.player2': 'Quel est le nom du deuxième joueur de l’équipe 2 ?',
    'teamB.voiceName': 'Quelle consigne vocale pour cette équipe ?',
    servingPlayerId: 'Quel joueur sert en premier ?',
  }
  return field ? questions[field] : 'Configuration PLAYER+ prête.'
}

function displayedValue(value: string, known = true): string {
  return known && value.trim() ? value : 'En attente…'
}

function playerPlusFieldValue(
  configuration: PlayerPlusConfigurationDraft,
  field: PlayerPlusEditField,
): string {
  if (field === 'servingPlayerId') return configuration.servingPlayerId
  const [teamKey, property] = field.split('.') as [
    'teamA' | 'teamB',
    'displayName' | 'voiceName' | 'player1' | 'player2' | 'positions',
  ]
  const team = configuration[teamKey]
  if (property === 'player1') return team.players[0].name
  if (property === 'player2') return team.players[1].name
  if (property === 'positions') return team.players[0].side
  return team[property]
}

interface SummaryValueProps {
  label: string
  value: string
  help?: string
  onEdit(): void
}

function SummaryValue({ label, value, help, onEdit }: SummaryValueProps) {
  return (
    <div className="setup-summary-value">
      <dt>{label}</dt>
      <dd>
        <button type="button" className="setup-edit-value" onClick={onEdit}>
          <span>{value}</span>
          <span aria-hidden="true">✎</span>
          <span className="sr-only">Modifier {label.toLowerCase()}</span>
        </button>
        {help && <small>{help}</small>}
      </dd>
    </div>
  )
}

export function MatchSetup({
  message,
  mode,
  configuration,
  playerPlusConfiguration,
  voiceSetup,
  microphoneStatus,
  dictationField,
  nextMissingField,
  dictationTrace,
  showDictationDiagnostics,
  onModeChange,
  onConfigurationChange,
  onPlayerPlusConfigurationChange,
  onDictate,
  onEditStateChange,
  onRestartConfiguration,
  onStartPlayerMatch,
  onStartPlayerPlusMatch,
}: MatchSetupProps) {
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('BEEP')
  const [editTarget, setEditTarget] = useState<SetupEditTarget | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState('')
  const playerReady = isPlayerConfigurationReady(configuration)
  const playerPlusResult = toPlayerPlusMatchConfiguration(
    playerPlusConfiguration,
  )
  const voiceStep = voiceSetup?.step ?? 'idle'
  const teamADisplayKnown =
    !['idle', 'team-a-display-name'].includes(voiceStep) ||
    configuration.teamA.displayName !== 'Équipe A'
  const teamBDisplayKnown =
    ['team-b-voice-name', 'server', 'confirmation', 'completed'].includes(
      voiceStep,
    ) || configuration.teamB.displayName !== 'Équipe B'
  const serverKnown =
    voiceStep === 'confirmation' || voiceStep === 'completed' || playerReady
  const allPlayers = [
    ...playerPlusConfiguration.teamA.players,
    ...playerPlusConfiguration.teamB.players,
  ]

  const openPlayerEdit = (field: PlayerEditField) => {
    const value =
      field === 'servingTeam'
        ? configuration.servingTeam
        : field.startsWith('teamA')
          ? configuration.teamA[
              field.endsWith('displayName') ? 'displayName' : 'voiceName'
            ]
          : configuration.teamB[
              field.endsWith('displayName') ? 'displayName' : 'voiceName'
            ]
    setEditTarget({ mode: 'PLAYER', field })
    setEditValue(value)
    setEditError('')
    onEditStateChange(true)
  }

  const openPlayerPlusEdit = (field: PlayerPlusEditField) => {
    setEditTarget({ mode: 'PLAYERS_PLUS', field })
    setEditValue(playerPlusFieldValue(playerPlusConfiguration, field))
    setEditError('')
    onEditStateChange(true)
  }

  const closeEditor = () => {
    setEditTarget(null)
    setEditError('')
    onEditStateChange(false)
  }

  const validateEdit = (event: FormEvent) => {
    event.preventDefault()
    if (!editTarget) return

    if (editTarget.mode === 'PLAYER') {
      const nextConfiguration: PlayerMatchConfiguration = {
        mode: 'PLAYER',
        teamA: { ...configuration.teamA },
        teamB: { ...configuration.teamB },
        servingTeam: configuration.servingTeam,
      }
      const field = editTarget.field
      let error: string | null = null
      if (field === 'servingTeam') {
        nextConfiguration.servingTeam = editValue as 'A' | 'B'
      } else {
        const teamKey = field.startsWith('teamA') ? 'teamA' : 'teamB'
        const property = field.endsWith('displayName')
          ? 'displayName'
          : 'voiceName'
        const value = editValue.trim()
        error =
          property === 'displayName'
            ? validateDisplayName(value)
            : validateVoiceName(value)
        if (
          !error &&
          property === 'voiceName' &&
          matchesControlledResponse(
            value,
            nextConfiguration[teamKey === 'teamA' ? 'teamB' : 'teamA']
              .voiceName,
          )
        ) {
          error = 'Les consignes vocales doivent être différentes.'
        }
        nextConfiguration[teamKey][property] = value
      }
      if (error) {
        setEditError(error)
        return
      }
      onConfigurationChange(nextConfiguration, field)
      closeEditor()
      return
    }

    const field = editTarget.field
    if (field === 'teamA.positions' || field === 'teamB.positions') {
      const teamKey = field.startsWith('teamA') ? 'teamA' : 'teamB'
      const team = playerPlusConfiguration[teamKey]
      const firstSide = editValue as PlayerSide
      onPlayerPlusConfigurationChange({
        ...playerPlusConfiguration,
        [teamKey]: {
          ...team,
          players: [
            { ...team.players[0], side: firstSide },
            {
              ...team.players[1],
              side: firstSide === 'RIGHT' ? 'LEFT' : 'RIGHT',
            },
          ],
        },
      })
      closeEditor()
      return
    }
    if (field === 'servingPlayerId') {
      if (!editValue) {
        setEditError('Le premier serveur est obligatoire.')
        return
      }
      onPlayerPlusConfigurationChange({
        ...playerPlusConfiguration,
        servingPlayerId:
          editValue as PlayerPlusConfigurationDraft['servingPlayerId'],
      })
      closeEditor()
      return
    }
    const result = applyPlayerPlusDictation(
      playerPlusConfiguration,
      field,
      editValue,
    )
    if (!result.accepted) {
      setEditError(result.rejectionReason)
      return
    }
    onPlayerPlusConfigurationChange(result.draft)
    closeEditor()
  }

  return (
    <section className="panel setup-panel" aria-labelledby="setup-title">
      <header className="setup-title-block">
        <p className="setup-eyebrow">Configuration guidée</p>
        <h2 id="setup-title">Configurer le match</h2>
      </header>

      <section className="setup-primary-action" aria-label="Action principale">
        <span>Dites</span>
        <strong>« Nouveau match »</strong>
        <span>pour commencer.</span>
      </section>

      <p
        className={`setup-listening-state setup-listening-state--${microphoneStatus}`}
        aria-live="polite"
      >
        <span aria-hidden="true" />
        {microphoneLabels[microphoneStatus]}
      </p>

      {(voiceSetup || mode === 'PLAYERS_PLUS') && (
        <section className="setup-current-question" aria-live="polite">
          <p>Question en cours</p>
          <h3>
            {mode === 'PLAYER'
              ? voiceSetup?.prompt
              : playerPlusQuestion(nextMissingField)}
          </h3>
          {mode === 'PLAYERS_PLUS' && nextMissingField && (
            <button
              className="setup-answer-voice"
              type="button"
              disabled={dictationField !== null}
              onClick={() => onDictate(nextMissingField)}
            >
              {dictationField ? 'Parlez maintenant…' : 'Répondre à la voix'}
            </button>
          )}
          {voiceSetup?.message && <p className="error">{voiceSetup.message}</p>}
        </section>
      )}

      {message && (
        <p className="error setup-message" role="alert">
          {message}
        </p>
      )}

      <section className="setup-summary" aria-labelledby="setup-summary-title">
        <h3 id="setup-summary-title">Informations reconnues</h3>
        {mode === 'PLAYER' ? (
          <>
            <div className="setup-team-grid">
              <article className="setup-team-card">
                <h4>Équipe 1</h4>
                <dl>
                  <SummaryValue
                    label="Nom affiché"
                    value={displayedValue(
                      configuration.teamA.displayName,
                      teamADisplayKnown,
                    )}
                    onEdit={() => openPlayerEdit('teamA.displayName')}
                  />
                  <SummaryValue
                    label="Consigne vocale"
                    value={displayedValue(configuration.teamA.voiceName)}
                    help="Mot prononcé pour lui donner un point."
                    onEdit={() => openPlayerEdit('teamA.voiceName')}
                  />
                </dl>
              </article>
              <article className="setup-team-card">
                <h4>Équipe 2</h4>
                <dl>
                  <SummaryValue
                    label="Nom affiché"
                    value={displayedValue(
                      configuration.teamB.displayName,
                      teamBDisplayKnown,
                    )}
                    onEdit={() => openPlayerEdit('teamB.displayName')}
                  />
                  <SummaryValue
                    label="Consigne vocale"
                    value={displayedValue(configuration.teamB.voiceName)}
                    help="Mot prononcé pour lui donner un point."
                    onEdit={() => openPlayerEdit('teamB.voiceName')}
                  />
                </dl>
              </article>
            </div>
            <dl className="setup-server-summary">
              <SummaryValue
                label="Service"
                value={displayedValue(
                  configuration.servingTeam === 'A'
                    ? configuration.teamA.displayName
                    : configuration.teamB.displayName,
                  serverKnown,
                )}
                onEdit={() => openPlayerEdit('servingTeam')}
              />
            </dl>
          </>
        ) : (
          <div className="setup-team-grid">
            {(['teamA', 'teamB'] as const).map((teamKey, index) => {
              const team = playerPlusConfiguration[teamKey]
              return (
                <article className="setup-team-card" key={teamKey}>
                  <h4>Équipe {index + 1}</h4>
                  <dl>
                    <SummaryValue
                      label="Nom affiché"
                      value={displayedValue(team.displayName)}
                      onEdit={() =>
                        openPlayerPlusEdit(`${teamKey}.displayName`)
                      }
                    />
                    {team.players.map((player, playerIndex) => (
                      <SummaryValue
                        key={player.id}
                        label={`Joueur ${playerIndex + 1} · ${player.side === 'RIGHT' ? 'Droite' : 'Gauche'}`}
                        value={displayedValue(player.name)}
                        onEdit={() =>
                          openPlayerPlusEdit(
                            `${teamKey}.${playerIndex === 0 ? 'player1' : 'player2'}`,
                          )
                        }
                      />
                    ))}
                    <SummaryValue
                      label="Positions"
                      value={`${team.players[0].side === 'RIGHT' ? 'Joueur 1 à droite' : 'Joueur 1 à gauche'}`}
                      onEdit={() => openPlayerPlusEdit(`${teamKey}.positions`)}
                    />
                    <SummaryValue
                      label="Consigne vocale"
                      value={displayedValue(team.voiceName)}
                      help="Mot prononcé pour lui donner un point."
                      onEdit={() => openPlayerPlusEdit(`${teamKey}.voiceName`)}
                    />
                  </dl>
                </article>
              )
            })}
            <dl className="setup-server-summary setup-server-summary--plus">
              <SummaryValue
                label="Premier serveur"
                value={displayedValue(
                  allPlayers.find(
                    ({ id }) => id === playerPlusConfiguration.servingPlayerId,
                  )?.name ?? '',
                )}
                onEdit={() => openPlayerPlusEdit('servingPlayerId')}
              />
            </dl>
          </div>
        )}
      </section>

      <details className="setup-voice-explanation">
        <summary>À quoi sert la consigne vocale ?</summary>
        <p>
          Pendant le match, prononcez cette consigne pour attribuer un point à
          l’équipe correspondante.
        </p>
      </details>

      <fieldset className="setup-mode-selector setup-mode-selector--secondary">
        <legend>Mode de jeu</legend>
        <label>
          <input
            type="radio"
            name="setup-mode"
            value="PLAYER"
            checked={mode === 'PLAYER'}
            onChange={() => onModeChange('PLAYER')}
          />
          <span>
            <strong>PLAYER</strong>
            <small>Deux équipes</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="setup-mode"
            value="PLAYERS_PLUS"
            checked={mode === 'PLAYERS_PLUS'}
            onChange={() => onModeChange('PLAYERS_PLUS')}
          />
          <span>
            <strong>PLAYER+</strong>
            <small>Quatre joueurs</small>
          </span>
        </label>
      </fieldset>

      {voiceSetup && mode === 'PLAYER' && (
        <button
          className="restart-configuration"
          type="button"
          onClick={onRestartConfiguration}
        >
          Recommencer
        </button>
      )}

      {mode === 'PLAYER' ? (
        <details className="setup-alternatives" open={!voiceSetup}>
          <summary>Actions secondaires</summary>
          <label>
            Feedback après commande acceptée
            <select
              value={feedbackMode}
              onChange={(event) =>
                setFeedbackMode(event.target.value as FeedbackMode)
              }
            >
              <option value="BEEP">Bip court</option>
              <option value="OK">Voix « OK »</option>
              <option value="NONE">Aucun</option>
            </select>
          </label>
          <button
            className="setup-start-match"
            type="button"
            disabled={!playerReady}
            onClick={() => onStartPlayerMatch(feedbackMode)}
          >
            Démarrer le match
          </button>
        </details>
      ) : (
        <div className="setup-coming-soon" role="status">
          <strong>PLAYER+</strong>
          <label>
            Feedback après commande acceptée
            <select
              value={feedbackMode}
              onChange={(event) =>
                setFeedbackMode(event.target.value as FeedbackMode)
              }
            >
              <option value="BEEP">Bip court</option>
              <option value="OK">Voix « OK »</option>
              <option value="NONE">Aucun</option>
            </select>
          </label>
          <button
            className="setup-start-match"
            type="button"
            disabled={!playerPlusResult.ok}
            onClick={() => onStartPlayerPlusMatch(feedbackMode)}
          >
            Démarrer le match
          </button>
          {!playerPlusResult.ok && <small>{playerPlusResult.reason}</small>}
        </div>
      )}

      {showDictationDiagnostics && dictationTrace && (
        <details className="setup-dictation-diagnostics">
          <summary>Diagnostic de dictée PLAYER+</summary>
          <p>
            Cible : {dictationTrace.targetedField} · étape avant :{' '}
            {dictationTrace.stepBefore ?? 'terminée'} · champ modifié :{' '}
            {dictationTrace.modifiedField ?? 'aucun'}
          </p>
          <p>
            Brut : {dictationTrace.rawTranscript || '—'} · normalisé :{' '}
            {dictationTrace.normalizedTranscript || '—'} · rejet :{' '}
            {dictationTrace.rejectionReason || 'aucun'}
          </p>
        </details>
      )}

      {editTarget && (
        <div className="setup-edit-backdrop" role="presentation">
          <section
            className="setup-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-edit-title"
          >
            <form onSubmit={validateEdit}>
              <h3 id="setup-edit-title">
                {editTarget.mode === 'PLAYER'
                  ? playerEditLabels[editTarget.field]
                  : editTarget.field.endsWith('positions')
                    ? 'Positions des joueurs'
                    : SETUP_FIELD_LABELS[
                        editTarget.field as SetupDictationField
                      ]}
              </h3>
              {editTarget.mode === 'PLAYER' &&
              editTarget.field === 'servingTeam' ? (
                <select
                  aria-label="Équipe au service"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                >
                  <option value="A">{configuration.teamA.displayName}</option>
                  <option value="B">{configuration.teamB.displayName}</option>
                </select>
              ) : editTarget.mode === 'PLAYERS_PLUS' &&
                editTarget.field.endsWith('positions') ? (
                <select
                  aria-label="Position du joueur 1"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                >
                  <option value="RIGHT">Joueur 1 à droite</option>
                  <option value="LEFT">Joueur 1 à gauche</option>
                </select>
              ) : editTarget.mode === 'PLAYERS_PLUS' &&
                editTarget.field === 'servingPlayerId' ? (
                <select
                  aria-label="Premier serveur"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                >
                  <option value="">À choisir</option>
                  {allPlayers.map((player) => (
                    <option value={player.id} key={player.id}>
                      {player.name || `Joueur ${player.id}`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Nouvelle valeur"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  autoFocus
                />
              )}
              {editError && <p className="error">{editError}</p>}
              <div className="setup-edit-actions">
                <button type="button" onClick={closeEditor}>
                  Annuler
                </button>
                <button type="submit">Valider</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
