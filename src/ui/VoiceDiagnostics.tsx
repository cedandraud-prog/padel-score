import { useEffect, useState } from 'react'
import type { MatchControllerSnapshot } from '../application/MatchController'
import type { ScreenWakeLockSnapshot } from '../application/ScreenWakeLockManager'
import type { ListeningStrategy } from '../voice/ListeningStrategy'
import { SpeechSynthesisService } from '../voice/SpeechSynthesisService'

interface VoiceDiagnosticsProps {
  snapshot: MatchControllerSnapshot
  wakeLock: ScreenWakeLockSnapshot
  synthesis: SpeechSynthesisService
  onStrategyChange(strategy: ListeningStrategy): void
  onReset(): void
}

const microphoneLabels = {
  inactive: 'Inactif',
  starting: 'Démarrage de l’écoute',
  listening: 'Écoute active',
  speaking: 'Annonce en cours',
  disabled: 'Écoute désactivée',
  unavailable: 'Reconnaissance indisponible',
  error: 'Erreur microphone',
} as const

const wakeLockStatusLabels = {
  inactive: 'inactif',
  requesting: 'demandé',
  active: 'acquis',
  unavailable: 'indisponible',
  error: 'erreur',
} as const

const wakeLockReleaseLabels = {
  EXPERIENCE_INACTIVE: 'expérience inactive',
  SYSTEM: 'Chrome / Android',
  DESTROY: 'démontage',
  ACQUISITION_ABORTED: 'acquisition devenue inutile',
} as const

interface VoiceSettingsDiagnosticProps {
  synthesis: SpeechSynthesisService
  announcementInProgress?: boolean
}

export function VoiceSettingsDiagnostic({
  synthesis,
  announcementInProgress = false,
}: VoiceSettingsDiagnosticProps) {
  const [voices, setVoices] = useState(() => synthesis.getFrenchVoices())
  const [message, setMessage] = useState('')
  const currentVoice = synthesis.getCurrentVoice()

  useEffect(
    () =>
      synthesis.subscribeToVoiceChanges(() => {
        setVoices(synthesis.getFrenchVoices())
      }),
    [synthesis],
  )

  const selectVoice = (id: string) => {
    const saved = synthesis.selectVoice(id || null)
    setVoices(synthesis.getFrenchVoices())
    setMessage(
      saved ? 'Choix mémorisé sur cet appareil.' : 'Choix non mémorisé.',
    )
  }

  const testCurrentVoice = async () => {
    if (!currentVoice) return
    setMessage('Test en cours…')
    try {
      await synthesis.testVoice(currentVoice.id)
      setMessage('Test terminé.')
    } catch {
      setMessage('Impossible de tester cette voix.')
    }
  }

  return (
    <section
      className="voice-settings-diagnostic"
      aria-label="Voix des annonces"
    >
      <h3>Voix des annonces</h3>
      {voices.length > 0 ? (
        <>
          <label>
            Voix française utilisée
            <select
              value={currentVoice?.id ?? ''}
              onChange={(event) => selectVoice(event.target.value)}
            >
              {voices.map((voice) => (
                <option value={voice.id} key={voice.id}>
                  {voice.name} ({voice.lang})
                  {voice.isDefault ? ' — par défaut' : ''}
                </option>
              ))}
            </select>
          </label>
          <p>
            Voix actuelle :{' '}
            <strong>
              {currentVoice?.name} ({currentVoice?.lang})
            </strong>
          </p>
          <button
            type="button"
            onClick={() => void testCurrentVoice()}
            disabled={announcementInProgress}
          >
            Tester cette voix
          </button>
        </>
      ) : (
        <p>Aucune voix française signalée par cet appareil.</p>
      )}
      {message && <p aria-live="polite">{message}</p>}
    </section>
  )
}

export function VoiceDiagnostics({
  snapshot,
  wakeLock,
  synthesis,
  onStrategyChange,
  onReset,
}: VoiceDiagnosticsProps) {
  const recognition = snapshot.recognitionDiagnostics
  const connection = snapshot.connectionQuality

  return (
    <details
      className="diagnostics"
      open={snapshot.microphoneStatus === 'error'}
    >
      <summary>Diagnostic vocal</summary>
      <div className="button-row">
        <label>
          Stratégie d’écoute
          <select
            value={snapshot.listeningStrategy}
            onChange={(event) =>
              onStrategyChange(event.target.value as ListeningStrategy)
            }
          >
            <option value="LEGACY">LEGACY</option>
            <option value="CONTINUOUS">CONTINUOUS</option>
          </select>
        </label>
        <button type="button" onClick={onReset}>
          Remise à zéro
        </button>
      </div>
      <VoiceSettingsDiagnostic
        synthesis={synthesis}
        announcementInProgress={snapshot.microphoneStatus === 'speaking'}
      />
      <p>
        Connexion Chrome : <strong>{connection.quality}</strong>
        <br />
        État :{' '}
        {connection.online === null
          ? 'indisponible'
          : connection.online
            ? 'En ligne'
            : 'Hors ligne'}
        <br />
        Réseau : {connection.effectiveType ?? 'indisponible'}
        <br />
        RTT estimé :{' '}
        {connection.rtt === null ? 'indisponible' : `${connection.rtt} ms`}
        <br />
        Débit descendant :{' '}
        {connection.downlink === null
          ? 'indisponible'
          : `${connection.downlink} Mb/s`}
        <br />
        Délai médian de reconnaissance :{' '}
        {connection.medianRecognitionDelay === null
          ? 'indisponible'
          : `${connection.medianRecognitionDelay} ms`}
        <br />
        Dernière erreur :{' '}
        {connection.recentNetworkErrors ? 'erreur réseau détectée' : 'aucune'}
        {connection.quality === 'FAIBLE' && (
          <>
            <br />
            Conseil : utilisez un partage 4G/5G
          </>
        )}
        <br />
        <small>
          Indice estimé — ne mesure pas directement le signal Wi-Fi.
        </small>
      </p>
      <dl>
        <div>
          <dt>ExperienceSession</dt>
          <dd>{snapshot.experience.stage}</dd>
        </div>
        <div>
          <dt>Experience Active</dt>
          <dd>{snapshot.experience.active ? 'oui' : 'non'}</dd>
        </div>
        <div>
          <dt>Wake Lock — état</dt>
          <dd>{wakeLockStatusLabels[wakeLock.status]}</dd>
        </div>
        <div>
          <dt>Wake Lock — API</dt>
          <dd>{wakeLock.apiAvailable ? 'disponible' : 'indisponible'}</dd>
        </div>
        <div>
          <dt>Wake Lock — demandé</dt>
          <dd>{wakeLock.requested ? 'oui' : 'non'}</dd>
        </div>
        <div>
          <dt>Wake Lock — acquis</dt>
          <dd>{wakeLock.acquired ? 'oui' : 'non'}</dd>
        </div>
        <div>
          <dt>Wake Lock — libéré</dt>
          <dd>{wakeLock.released ? 'oui' : 'non'}</dd>
        </div>
        <div>
          <dt>Acquisitions Wake Lock</dt>
          <dd>{wakeLock.acquisitionCount}</dd>
        </div>
        <div>
          <dt>Libérations Wake Lock</dt>
          <dd>{wakeLock.releaseCount}</dd>
        </div>
        <div>
          <dt>Origine dernière libération</dt>
          <dd>
            {wakeLock.lastReleaseReason
              ? wakeLockReleaseLabels[wakeLock.lastReleaseReason]
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Horodatage dernière libération</dt>
          <dd>
            {wakeLock.lastReleaseAt === null
              ? '—'
              : new Date(wakeLock.lastReleaseAt).toISOString()}
          </dd>
        </div>
        <div>
          <dt>Stratégie de reconnaissance</dt>
          <dd>{snapshot.listeningStrategy}</dd>
        </div>
        <div>
          <dt>Sessions créées</dt>
          <dd>{snapshot.voiceMetrics.sessionsCreated}</dd>
        </div>
        <div>
          <dt>Sessions terminées</dt>
          <dd>{snapshot.voiceMetrics.sessionsEnded}</dd>
        </div>
        <div>
          <dt>Relances</dt>
          <dd>{snapshot.voiceMetrics.restarts}</dd>
        </div>
        <div>
          <dt>Erreurs</dt>
          <dd>{snapshot.voiceMetrics.errors}</dd>
        </div>
        <div>
          <dt>Commandes reconnues</dt>
          <dd>{snapshot.voiceMetrics.commandsRecognized}</dd>
        </div>
        <div>
          <dt>Commandes perdues</dt>
          <dd>{snapshot.voiceMetrics.commandsLost}</dd>
        </div>
        <div>
          <dt>Dernière erreur de reconnaissance</dt>
          <dd>{snapshot.voiceMetrics.lastError || '—'}</dd>
        </div>
        <div>
          <dt>Microphone</dt>
          <dd>{microphoneLabels[snapshot.microphoneStatus]}</dd>
        </div>
        <div>
          <dt>Dernière transcription</dt>
          <dd>{snapshot.lastTranscript || '—'}</dd>
        </div>
        <div>
          <dt>Dernière commande</dt>
          <dd>{snapshot.lastCommand || '—'}</dd>
        </div>
        <div>
          <dt>Message</dt>
          <dd>{snapshot.message || '—'}</dd>
        </div>
        <div>
          <dt>Mode conversationnel</dt>
          <dd>{snapshot.conversationStatus}</dd>
        </div>
        <div>
          <dt>État conversationnel</dt>
          <dd>{snapshot.conversation.state}</dd>
        </div>
        <div>
          <dt>Tentative de démarrage</dt>
          <dd>{snapshot.recognitionAttemptId ?? '—'}</dd>
        </div>
        <div>
          <dt>Cycle de reconnaissance</dt>
          <dd>{snapshot.recognitionLifecycle}</dd>
        </div>
        <div>
          <dt>Intention d’écoute</dt>
          <dd>
            {snapshot.continuousListening.shouldListen ? 'active' : 'arrêtée'}
          </dd>
        </div>
        <div>
          <dt>Session technique</dt>
          <dd>
            {snapshot.continuousListening.recognitionRunning
              ? 'active'
              : snapshot.continuousListening.startPending
                ? 'démarrage'
                : 'inactive'}
          </dd>
        </div>
        <div>
          <dt>Relance technique</dt>
          <dd>
            {snapshot.continuousListening.restartPending
              ? 'planifiée'
              : 'aucune'}
          </dd>
        </div>
        <div>
          <dt>Feedback de commande</dt>
          <dd>{snapshot.feedbackMode}</dd>
        </div>
        <div>
          <dt>Transcription normalisée</dt>
          <dd>{snapshot.normalizedTranscript || '—'}</dd>
        </div>
        <div>
          <dt>Interprétation</dt>
          <dd>{snapshot.interpretation || '—'}</dd>
        </div>
        <div>
          <dt>Contenu extrait</dt>
          <dd>{snapshot.extractedContent || '—'}</dd>
        </div>
        <div>
          <dt>Résultat de correction</dt>
          <dd>{snapshot.correctionResult || '—'}</dd>
        </div>
        <div>
          <dt>Raison du rejet</dt>
          <dd>{snapshot.rejectionReason || '—'}</dd>
        </div>
        <div>
          <dt>Transcript brut</dt>
          <dd>{recognition?.rawTranscript ?? '—'}</dd>
        </div>
        <div>
          <dt>Confidence brute</dt>
          <dd>{recognition?.rawConfidence ?? 'absente'}</dd>
        </div>
        <div>
          <dt>Résultat final</dt>
          <dd>
            {recognition ? (recognition.isFinal ? 'true' : 'false') : '—'}
          </dd>
        </div>
        <div>
          <dt>Longueur des résultats</dt>
          <dd>{recognition?.resultsLength ?? '—'}</dd>
        </div>
        <div>
          <dt>Index du résultat</dt>
          <dd>{recognition?.resultIndex ?? '—'}</dd>
        </div>
      </dl>
      <section className="voice-trace" aria-label="Trace vocale horodatée">
        <h3>Trace vocale horodatée</h3>
        {snapshot.voiceTrace.length === 0 ? (
          <p>Aucun événement.</p>
        ) : (
          <ol>
            {snapshot.voiceTrace.map((event, index) => (
              <li key={`${event.at}-${event.type}-${index}`}>
                <time dateTime={new Date(event.at).toISOString()}>
                  {new Date(event.at).toISOString()}
                </time>{' '}
                — <strong>{event.type}</strong> — {event.origin}
                {event.attemptId === null
                  ? ''
                  : ` — tentative ${event.attemptId}`}
                {event.announcementId === undefined
                  ? ''
                  : ` — annonce ${event.announcementId}`}
                {event.announcementType ? ` — ${event.announcementType}` : ''}
                {event.soundType ? ` — ${event.soundType}` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>
    </details>
  )
}
