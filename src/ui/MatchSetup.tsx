import { useState, type FormEvent } from 'react'
import {
  type MatchConfiguration,
  validateMatchConfiguration,
} from '../application/matchConfiguration'
import type { VoiceMatchSetupSnapshot } from '../application/VoiceMatchSetup'
import type { FeedbackMode } from '../voice/speechTypes'

interface MatchSetupProps {
  message: string
  configuration: MatchConfiguration
  voiceSetup: VoiceMatchSetupSnapshot | null
  onConfigurationChange(configuration: MatchConfiguration): void
  onStart(configuration: MatchConfiguration, feedbackMode: FeedbackMode): void
  onVoiceSetup(feedbackMode: FeedbackMode): void
}

export function MatchSetup({
  message,
  configuration,
  voiceSetup,
  onConfigurationChange,
  onStart,
  onVoiceSetup,
}: MatchSetupProps) {
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('BEEP')
  const [validationMessage, setValidationMessage] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const error = validateMatchConfiguration(configuration)
    if (error) {
      setValidationMessage(error)
      return
    }
    setValidationMessage('')
    onStart(configuration, feedbackMode)
  }

  return (
    <section className="panel setup-panel" aria-labelledby="setup-title">
      <h2 id="setup-title">Configurer le match</h2>
      <form onSubmit={submit}>
        <label>
          Nom équipe A
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
          Identifiant vocal équipe A
          <input
            value={configuration.teamA.voiceIdentifier}
            onChange={(event) =>
              onConfigurationChange({
                ...configuration,
                teamA: {
                  ...configuration.teamA,
                  voiceIdentifier: event.target.value,
                },
              })
            }
            autoComplete="off"
          />
        </label>
        <label>
          Nom équipe B
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
          Identifiant vocal équipe B
          <input
            value={configuration.teamB.voiceIdentifier}
            onChange={(event) =>
              onConfigurationChange({
                ...configuration,
                teamB: {
                  ...configuration.teamB,
                  voiceIdentifier: event.target.value,
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
        {(validationMessage || message) && (
          <p className="error" role="alert">
            {validationMessage || message}
          </p>
        )}
        <button type="submit" className="primary">
          Démarrer le match
        </button>
        <button
          type="button"
          onClick={() => onVoiceSetup(feedbackMode)}
          disabled={voiceSetup !== null}
        >
          Configurer à la voix
        </button>
      </form>
      {voiceSetup && (
        <div aria-live="polite">
          <h3>Configuration vocale</h3>
          <p>{voiceSetup.prompt}</p>
          {voiceSetup.message && <p className="error">{voiceSetup.message}</p>}
        </div>
      )}
    </section>
  )
}
