import { useState } from 'react'
import type { MicrophoneStatus } from '../application/MatchController'
import type { MatchConfiguration } from '../application/matchConfiguration'
import type { VoiceMatchSetupSnapshot } from '../application/VoiceMatchSetup'
import type { FeedbackMode } from '../voice/speechTypes'

interface MatchSetupProps {
  message: string
  configuration: MatchConfiguration
  voiceSetup: VoiceMatchSetupSnapshot | null
  microphoneStatus: MicrophoneStatus
  onVoiceSetup(feedbackMode: FeedbackMode): void
  onRestartConfiguration(): void
}

const microphoneLabels: Record<MicrophoneStatus, string> = {
  inactive: 'En attente',
  starting: 'Activation de l’écoute…',
  listening: 'Écoute active',
  speaking: 'Annonce en cours',
  disabled: 'Écoute désactivée',
  unavailable: 'Écoute indisponible',
  error: 'Écoute interrompue',
}

function displayedValue(value: string, captured: boolean): string {
  return captured && value.trim() ? value : 'En attente…'
}

export function MatchSetup({
  message,
  configuration,
  voiceSetup,
  microphoneStatus,
  onVoiceSetup,
  onRestartConfiguration,
}: MatchSetupProps) {
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('BEEP')
  const step = voiceSetup?.step ?? 'idle'
  const teamADisplayCaptured = !['idle', 'team-a-display-name'].includes(step)
  const teamBDisplayCaptured = [
    'team-b-voice-name',
    'team-b-validation',
    'server',
    'confirmation',
    'completed',
  ].includes(step)
  const serverCaptured = step === 'confirmation' || step === 'completed'

  return (
    <section className="panel setup-panel" aria-labelledby="setup-title">
      <header className="setup-title-block">
        <p className="setup-eyebrow">Configuration vocale</p>
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

      {voiceSetup && (
        <section className="setup-current-question" aria-live="polite">
          <p>Question en cours</p>
          <h3>{voiceSetup.prompt}</h3>
          {voiceSetup.message && <p className="error">{voiceSetup.message}</p>}
        </section>
      )}

      {message && (
        <p className="error setup-message" role="alert">
          {message}
        </p>
      )}

      <section className="setup-summary" aria-labelledby="setup-summary-title">
        <h3 id="setup-summary-title">Informations reconnues</h3>
        <div className="setup-team-grid">
          <article className="setup-team-card">
            <h4>Équipe 1</h4>
            <dl>
              <div>
                <dt>Nom affiché</dt>
                <dd>
                  <output>
                    {displayedValue(
                      configuration.teamA.displayName,
                      teamADisplayCaptured,
                    )}
                  </output>
                </dd>
              </div>
              <div>
                <dt>Consigne vocale</dt>
                <dd>
                  <output>
                    {displayedValue(
                      configuration.teamA.voiceName,
                      Boolean(configuration.teamA.voiceName.trim()),
                    )}
                  </output>
                </dd>
              </div>
            </dl>
          </article>
          <article className="setup-team-card">
            <h4>Équipe 2</h4>
            <dl>
              <div>
                <dt>Nom affiché</dt>
                <dd>
                  <output>
                    {displayedValue(
                      configuration.teamB.displayName,
                      teamBDisplayCaptured,
                    )}
                  </output>
                </dd>
              </div>
              <div>
                <dt>Consigne vocale</dt>
                <dd>
                  <output>
                    {displayedValue(
                      configuration.teamB.voiceName,
                      Boolean(configuration.teamB.voiceName.trim()),
                    )}
                  </output>
                </dd>
              </div>
            </dl>
          </article>
        </div>
        <dl className="setup-server-summary">
          <div>
            <dt>Service</dt>
            <dd>
              <output>
                {serverCaptured
                  ? configuration.servingTeam === 'A'
                    ? configuration.teamA.displayName
                    : configuration.teamB.displayName
                  : 'En attente…'}
              </output>
            </dd>
          </div>
        </dl>
      </section>

      {voiceSetup && (
        <button
          className="restart-configuration"
          type="button"
          onClick={onRestartConfiguration}
        >
          Recommencer
        </button>
      )}

      {!voiceSetup && (
        <details className="setup-alternatives">
          <summary>Autres options</summary>
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
          <button type="button" onClick={() => onVoiceSetup(feedbackMode)}>
            Configurer à la voix
          </button>
        </details>
      )}
    </section>
  )
}
