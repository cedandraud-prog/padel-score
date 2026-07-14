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
      voiceTrace: [
        {
          at: Date.parse('2026-07-13T12:00:00.500Z'),
          type: 'ANNOUNCEMENT_STARTED',
          origin: 'ANNOUNCEMENT_VOICE-SETUP',
          attemptId: null,
          announcementId: 3,
          announcementType: 'RESPONSE_REQUIRED',
        },
        {
          at: Date.parse('2026-07-13T12:00:01.000Z'),
          type: 'START_CALLED',
          origin: 'CONTINUOUS_RESTART_TIMER',
          attemptId: 2,
        },
        {
          at: Date.parse('2026-07-13T12:00:02.000Z'),
          type: 'APPLICATION_SOUND',
          origin: 'EXPECTED_RESPONSE_READY',
          attemptId: 2,
          soundType: 'READY_BEEP',
        },
      ],
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
      recognitionTiming: {
        generation: 2,
        audioReadinessSource: 'audiostart',
        startRequestedAt: Date.parse('2026-07-13T12:00:00.000Z'),
        startToOnStartMs: 120,
        onStartToAudioStartMs: 80,
        beepStartedAt: Date.parse('2026-07-13T12:00:00.200Z'),
        beepEndedAt: Date.parse('2026-07-13T12:00:00.250Z'),
        beepEndToSpeechStartMs: 40,
        speechDurationMs: 600,
        speechEndToResultMs: 2_900,
        beepEndToResultMs: 3_540,
        decision: 'accepted',
        decisionGeneration: 2,
        decisionReason: 'Commande exécutée.',
      },
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
        onTestAnnouncementVoice={async () => undefined}
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
    expect(html).toContain('Trace vocale horodatée')
    expect(html).toContain('ANNOUNCEMENT_STARTED')
    expect(html).toContain('annonce 3')
    expect(html).toContain('RESPONSE_REQUIRED')
    expect(html).toContain('CONTINUOUS_RESTART_TIMER')
    expect(html).toContain('READY_BEEP')
  })
})
