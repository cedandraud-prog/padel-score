import type { MatchControllerSnapshot } from '../application/MatchController'

interface VoiceDiagnosticsProps {
  snapshot: MatchControllerSnapshot
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

export function VoiceDiagnostics({ snapshot }: VoiceDiagnosticsProps) {
  const recognition = snapshot.recognitionDiagnostics
  const connection = snapshot.connectionQuality

  return (
    <details
      className="diagnostics"
      open={snapshot.microphoneStatus === 'error'}
    >
      <summary>Diagnostic vocal</summary>
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
    </details>
  )
}
