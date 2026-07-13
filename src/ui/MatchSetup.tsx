import { useState } from 'react'
import type { MatchConfiguration } from '../application/matchConfiguration'
import type { VoiceMatchSetupSnapshot } from '../application/VoiceMatchSetup'
import type { FeedbackMode } from '../voice/speechTypes'

interface MatchSetupProps {
  message: string
  configuration: MatchConfiguration
  voiceSetup: VoiceMatchSetupSnapshot | null
  onConfigurationChange(configuration: MatchConfiguration): void
  onVoiceSetup(feedbackMode: FeedbackMode): void
  onRestartConfiguration(): void
}

export function MatchSetup({
  message,
  configuration,
  voiceSetup,
  onConfigurationChange,
  onVoiceSetup,
  onRestartConfiguration,
}: MatchSetupProps) {
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('BEEP')

  return (
    <section className="panel setup-panel" aria-labelledby="setup-title">
      <h2 id="setup-title">Configurer le match</h2>
      <p className="setup-help">
        Dites <strong>« Nouveau match »</strong> pour lancer la configuration
        vocale.
      </p>
      <div className="setup-form">
        <label>
          Nom affiché équipe A
          <input
            value={configuration.teamA.displayName}
            onChange={(event) =>
              onConfigurationChange({
                ...configuration,
                teamA: {
                  ...configuration.teamA,
                  displayName: event.target.value,
                },
              })
            }
            autoComplete="off"
          />
        </label>
        <label>
          Consigne vocale équipe A
          <input
            value={configuration.teamA.voiceName}
            onChange={(event) =>
              onConfigurationChange({
                ...configuration,
                teamA: {
                  ...configuration.teamA,
                  voiceName: event.target.value,
                },
              })
            }
            autoComplete="off"
          />
        </label>
        <label>
          Nom affiché équipe B
          <input
            value={configuration.teamB.displayName}
            onChange={(event) =>
              onConfigurationChange({
                ...configuration,
                teamB: {
                  ...configuration.teamB,
                  displayName: event.target.value,
                },
              })
            }
            autoComplete="off"
          />
        </label>
        <label>
          Consigne vocale équipe B
          <input
            value={configuration.teamB.voiceName}
            onChange={(event) =>
              onConfigurationChange({
                ...configuration,
                teamB: {
                  ...configuration.teamB,
                  voiceName: event.target.value,
                },
              })
            }
            autoComplete="off"
          />
        </label>
        <fieldset>
          <legend>Équipe au service</legend>
          <label className="choice">
            <input
              type="radio"
              name="server"
              checked={configuration.servingTeam === 'A'}
              onChange={() =>
                onConfigurationChange({ ...configuration, servingTeam: 'A' })
              }
            />
            Équipe A
          </label>
          <label className="choice">
            <input
              type="radio"
              name="server"
              checked={configuration.servingTeam === 'B'}
              onChange={() =>
                onConfigurationChange({ ...configuration, servingTeam: 'B' })
              }
            />
            Équipe B
          </label>
        </fieldset>
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
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={() => onVoiceSetup(feedbackMode)}
          disabled={voiceSetup !== null}
        >
          Configurer à la voix
        </button>
      </div>
      {voiceSetup && (
        <div className="voice-setup-status">
          <div aria-live="polite">
            <h3>Configuration vocale</h3>
            <p>{voiceSetup.prompt}</p>
            {voiceSetup.message && (
              <p className="error">{voiceSetup.message}</p>
            )}
          </div>
          <button
            className="restart-configuration"
            type="button"
            onClick={onRestartConfiguration}
            aria-describedby="restart-configuration-help"
          >
            Recommencer
          </button>
          <small id="restart-configuration-help">
            Efface la configuration en cours et reprend depuis le début.
          </small>
        </div>
      )}
    </section>
  )
}
