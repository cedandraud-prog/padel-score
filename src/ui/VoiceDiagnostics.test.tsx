import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MatchControllerSnapshot } from '../application/MatchController'
import type { ScreenWakeLockSnapshot } from '../application/ScreenWakeLockManager'
import { SpeechSynthesisService } from '../voice/SpeechSynthesisService'
import { VoiceDiagnostics, VoiceSettingsDiagnostic } from './VoiceDiagnostics'

describe('VoiceSettingsDiagnostic', () => {
  it('limite la sélection de voix aux voix françaises du diagnostic', () => {
    const frenchVoice = {
      name: 'Voix française',
      lang: 'fr-FR',
      voiceURI: 'french',
      default: true,
      localService: true,
    } as SpeechSynthesisVoice
    const englishVoice = {
      ...frenchVoice,
      name: 'English voice',
      lang: 'en-US',
      voiceURI: 'english',
    }
    const synthesis = {
      getVoices: () => [frenchVoice, englishVoice],
      cancel: () => undefined,
      speak: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as SpeechSynthesis
    const service = new SpeechSynthesisService(
      synthesis,
      null,
      (text) => ({ text }) as SpeechSynthesisUtterance,
    )

    const html = renderToStaticMarkup(
      <VoiceSettingsDiagnostic synthesis={service} />,
    )

    expect(html).toContain('Voix des annonces')
    expect(html).toContain('Voix française')
    expect(html).not.toContain('English voice')
    expect(html).toContain('Tester cette voix')
  })

  it('affiche le cycle complet de l’expérience, du Wake Lock et de la reconnaissance', () => {
    const snapshot = {
      microphoneStatus: 'listening',
      listeningStrategy: 'CONTINUOUS',
      recognitionDiagnostics: null,
      connectionQuality: {
        quality: 'BONNE',
        online: true,
        effectiveType: '4g',
        rtt: 30,
        downlink: 10,
        medianRecognitionDelay: 120,
        recentNetworkErrors: false,
      },
      experience: { stage: 'CONFIGURING', active: true },
      voiceMetrics: {
        sessionsCreated: 4,
        sessionsEnded: 3,
        restarts: 2,
        errors: 1,
        commandsRecognized: 5,
        commandsLost: 1,
        lastError: 'network',
      },
      continuousListening: {
        shouldListen: true,
        recognitionRunning: true,
        startPending: false,
        restartPending: false,
      },
      feedbackMode: 'NONE',
      lastTranscript: '',
      lastCommand: '',
      message: '',
      conversationStatus: 'Mode normal',
      conversation: { state: 'PLAYER_LISTENING' },
      recognitionAttemptId: null,
      recognitionLifecycle: 'Relance technique active',
      normalizedTranscript: '',
      interpretation: '',
      extractedContent: '',
      correctionResult: '',
      rejectionReason: '',
    } as unknown as MatchControllerSnapshot
    const wakeLock: ScreenWakeLockSnapshot = {
      status: 'active',
      warning: null,
      apiAvailable: true,
      requested: true,
      acquired: true,
      released: false,
      acquisitionCount: 2,
      releaseCount: 1,
      lastReleaseReason: 'SYSTEM',
      lastReleaseAt: Date.parse('2026-07-13T12:00:00.000Z'),
    }

    const html = renderToStaticMarkup(
      <VoiceDiagnostics
        snapshot={snapshot}
        wakeLock={wakeLock}
        synthesis={new SpeechSynthesisService(null, null, null)}
        onStrategyChange={() => undefined}
        onReset={() => undefined}
      />,
    )

    for (const label of [
      'ExperienceSession',
      'Experience Active',
      'Wake Lock — API',
      'Wake Lock — demandé',
      'Wake Lock — acquis',
      'Wake Lock — libéré',
      'Acquisitions Wake Lock',
      'Libérations Wake Lock',
      'Origine dernière libération',
      'Horodatage dernière libération',
      'Stratégie de reconnaissance',
      'Sessions créées',
      'Sessions terminées',
      'Relances',
      'Erreurs',
      'Dernière erreur de reconnaissance',
    ]) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Chrome / Android')
    expect(html).toContain('2026-07-13T12:00:00.000Z')
  })
})
