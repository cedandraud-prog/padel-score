import { useEffect, useRef, useState } from 'react'
import {
  MatchController,
  type MatchControllerSnapshot,
} from './application/MatchController'
import { CorrectionPanel } from './ui/CorrectionPanel'
import { MatchScreen } from './ui/MatchScreen'
import { MatchSetup } from './ui/MatchSetup'
import { VoiceDiagnostics } from './ui/VoiceDiagnostics'
import { SpeechRecognitionService } from './voice/SpeechRecognitionService'
import { SpeechSynthesisService } from './voice/SpeechSynthesisService'
import { CommandFeedbackService } from './voice/CommandFeedbackService'
import { ReadinessCueService } from './voice/ReadinessCueService'
import { ScreenWakeLockManager } from './application/ScreenWakeLockManager'
import type { ScreenWakeLockSnapshot } from './application/ScreenWakeLockManager'
import { WakeLockWarning } from './ui/WakeLockWarning'
import { browserListeningStrategyStore } from './voice/ListeningStrategy'
import {
  applyPlayerPlusDictation,
  copyPlayerPlusConfigurationDraft,
  createPlayerPlusConfigurationDraft,
  getNextMissingSetupField,
  setupModeHasData,
  type PlayerPlusConfigurationDraft,
  type SetupDictationField,
  type SetupDictationTrace,
  type SetupMode,
} from './application/setupConfiguration'
import type { FeedbackMode } from './voice/speechTypes'

const strategyStore = browserListeningStrategyStore()
const diagnosticsEnabled = new URLSearchParams(window.location.search).has(
  'diagnostics',
)

export default function App() {
  const [synthesis] = useState(() => new SpeechSynthesisService())
  const [controller, setController] = useState<MatchController | null>(null)
  const [snapshot, setSnapshot] = useState<MatchControllerSnapshot | null>(null)
  const [setupMode, setSetupMode] = useState<SetupMode>('PLAYER')
  const [playerPlusConfiguration, setPlayerPlusConfiguration] =
    useState<PlayerPlusConfigurationDraft>(() =>
      createPlayerPlusConfigurationDraft(),
    )
  const [setupDictation, setSetupDictation] =
    useState<SpeechRecognitionService | null>(null)
  const [dictationField, setDictationField] =
    useState<SetupDictationField | null>(null)
  const [setupMessage, setSetupMessage] = useState('')
  const [setupDictationTrace, setSetupDictationTrace] =
    useState<SetupDictationTrace | null>(null)
  const activeDictationField = useRef<SetupDictationField | null>(null)
  const playerPlusConfigurationRef = useRef(playerPlusConfiguration)
  const dictationAttemptSequence = useRef(0)
  const activeDictationAttempt = useRef<number | null>(null)
  const activeDictationReceived = useRef(false)
  const resumeControllerListeningAfterEdit = useRef(false)
  const [wakeLockManager, setWakeLockManager] =
    useState<ScreenWakeLockManager | null>(null)
  const [wakeLockSnapshot, setWakeLockSnapshot] =
    useState<ScreenWakeLockSnapshot>({
      status: 'inactive',
      warning: null,
      apiAvailable: false,
      requested: false,
      acquired: false,
      released: false,
      acquisitionCount: 0,
      releaseCount: 0,
      lastReleaseReason: null,
      lastReleaseAt: null,
    })

  useEffect(() => {
    const activeController = new MatchController(
      new SpeechRecognitionService(),
      synthesis,
      new CommandFeedbackService(synthesis),
      undefined,
      new ReadinessCueService(),
      strategyStore.load(),
    )
    activeController.beginConfigurationExperience()
    const unsubscribe = activeController.subscribe(setSnapshot)
    setController(activeController)
    activeController.listenForNewMatch()
    return () => {
      unsubscribe()
      activeController.destroy()
    }
  }, [synthesis])

  useEffect(() => {
    const recognition = new SpeechRecognitionService()
    setSetupDictation(recognition)
    return () => recognition.dispose()
  }, [])

  useEffect(() => {
    const manager = new ScreenWakeLockManager()
    const unsubscribe = manager.subscribe(setWakeLockSnapshot)
    setWakeLockManager(manager)
    return () => {
      unsubscribe()
      void manager.destroy()
    }
  }, [])

  useEffect(() => {
    if (wakeLockManager) {
      void wakeLockManager.setExperienceActive(
        snapshot?.experience.active ?? false,
      )
    }
  }, [snapshot?.experience.active, wakeLockManager])

  if (!controller || !snapshot) return null

  const changeSetupMode = (nextMode: SetupMode) => {
    if (nextMode === setupMode) return
    const hasData = setupModeHasData(
      setupMode,
      snapshot.editingConfiguration,
      playerPlusConfiguration,
    )
    if (
      hasData &&
      !window.confirm(
        'Changer de mode effacera toute la configuration en cours. Continuer ?',
      )
    ) {
      return
    }

    setupDictation?.stop()
    activeDictationAttempt.current = null
    activeDictationReceived.current = false
    activeDictationField.current = null
    setDictationField(null)
    setSetupMessage('')
    const emptyPlayerPlus = createPlayerPlusConfigurationDraft()
    playerPlusConfigurationRef.current = emptyPlayerPlus
    setPlayerPlusConfiguration(emptyPlayerPlus)
    setSetupDictationTrace(null)
    controller.prepareNewMatch()
    controller.beginConfigurationExperience()
    setSetupMode(nextMode)
    if (nextMode === 'PLAYER') controller.listenForNewMatch()
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }))
  }

  const dictatePlayerPlusField = (field: SetupDictationField) => {
    if (!setupDictation?.isSupported || activeDictationField.current !== null) {
      setSetupMessage(
        setupDictation?.isSupported
          ? 'Une réponse vocale est déjà en cours.'
          : 'La dictée vocale est indisponible dans ce navigateur.',
      )
      return
    }

    activeDictationField.current = field
    const attemptId = ++dictationAttemptSequence.current
    activeDictationAttempt.current = attemptId
    activeDictationReceived.current = false
    setDictationField(field)
    setSetupMessage('')
    const draftBefore = copyPlayerPlusConfigurationDraft(
      playerPlusConfigurationRef.current,
    )
    const stepBefore = getNextMissingSetupField(draftBefore)
    setSetupDictationTrace({
      at: Date.now(),
      attemptId,
      targetedField: field,
      stepBefore,
      draftBefore,
      rawTranscript: '',
      normalizedTranscript: '',
      modifiedField: null,
      rejectionReason: 'En attente de transcription.',
      stepAfter: stepBefore,
    })

    setupDictation.start({
      onStart: () => undefined,
      onDiagnostic: () => undefined,
      onResult: ({ transcript }) => {
        if (activeDictationAttempt.current !== attemptId) return
        activeDictationReceived.current = true
        const result = applyPlayerPlusDictation(
          playerPlusConfigurationRef.current,
          field,
          transcript,
        )
        playerPlusConfigurationRef.current = result.draft
        setPlayerPlusConfiguration(result.draft)
        setSetupMessage(result.rejectionReason)
        setSetupDictationTrace({
          at: Date.now(),
          attemptId,
          targetedField: field,
          stepBefore,
          draftBefore,
          rawTranscript: transcript,
          normalizedTranscript: result.normalizedTranscript,
          modifiedField: result.modifiedField,
          rejectionReason: result.rejectionReason,
          stepAfter: result.nextMissingField,
        })
        setupDictation.stop()
      },
      onError: (_code, message) => {
        if (activeDictationAttempt.current !== attemptId) return
        setSetupMessage(message)
        setSetupDictationTrace((current) =>
          current?.attemptId === attemptId
            ? { ...current, rejectionReason: message }
            : current,
        )
        activeDictationAttempt.current = null
        activeDictationField.current = null
        setDictationField(null)
      },
      onEnd: () => {
        if (activeDictationAttempt.current !== attemptId) return
        if (!activeDictationReceived.current) {
          setSetupDictationTrace((current) =>
            current?.attemptId === attemptId
              ? {
                  ...current,
                  rejectionReason:
                    current.rejectionReason || 'Aucune transcription reçue.',
                }
              : current,
          )
        }
        activeDictationAttempt.current = null
        activeDictationField.current = null
        setDictationField(null)
      },
    })
  }

  const updatePlayerPlusConfiguration = (
    configuration: PlayerPlusConfigurationDraft,
  ) => {
    playerPlusConfigurationRef.current = configuration
    setPlayerPlusConfiguration(configuration)
    setSetupMessage('')
  }

  const changeSetupEditState = (editing: boolean) => {
    if (editing) {
      if (setupMode === 'PLAYER') {
        resumeControllerListeningAfterEdit.current =
          snapshot.conversation.isRunning
        if (resumeControllerListeningAfterEdit.current) {
          controller.disableListening()
        }
      } else {
        activeDictationAttempt.current = null
        activeDictationReceived.current = false
        activeDictationField.current = null
        setDictationField(null)
        setupDictation?.stop()
      }
      return
    }

    if (resumeControllerListeningAfterEdit.current) {
      resumeControllerListeningAfterEdit.current = false
      controller.enableListening()
    }
  }

  const startPlayerMatch = (feedbackMode: FeedbackMode) => {
    controller.startConfiguredMatch({
      configuration: snapshot.editingConfiguration,
      feedbackMode,
    })
  }

  const isMatchSetup =
    snapshot.phase === 'setup' || snapshot.phase === 'voice-setup'

  return (
    <main className={`app-shell${isMatchSetup ? ' app-shell--setup' : ''}`}>
      <header>
        <h1>PADEL SCORE</h1>
        <p>Vous jouez. Le système se souvient.</p>
      </header>

      {wakeLockSnapshot.warning && (
        <WakeLockWarning
          message={wakeLockSnapshot.warning}
          onDismiss={() => wakeLockManager?.dismissWarning()}
        />
      )}

      {isMatchSetup ? (
        <MatchSetup
          message={setupMessage || snapshot.message}
          mode={setupMode}
          configuration={snapshot.editingConfiguration}
          playerPlusConfiguration={playerPlusConfiguration}
          voiceSetup={snapshot.voiceSetup}
          microphoneStatus={
            dictationField ? 'listening' : snapshot.microphoneStatus
          }
          dictationField={dictationField}
          nextMissingField={getNextMissingSetupField(playerPlusConfiguration)}
          dictationTrace={setupDictationTrace}
          showDictationDiagnostics={diagnosticsEnabled}
          onModeChange={changeSetupMode}
          onConfigurationChange={(configuration, editedField) =>
            controller.updateEditingConfiguration(configuration, editedField)
          }
          onPlayerPlusConfigurationChange={updatePlayerPlusConfiguration}
          onDictate={dictatePlayerPlusField}
          onEditStateChange={changeSetupEditState}
          onRestartConfiguration={() => void controller.restartConfiguration()}
          onStartPlayerMatch={startPlayerMatch}
        />
      ) : (
        <>
          <MatchScreen
            snapshot={snapshot}
            onPoint={(team) => void controller.awardPoint(team)}
            onUndo={() => void controller.undo()}
            onScore={() => void controller.announcePointScore()}
            onFullScore={() => void controller.announceFullScore()}
            onCorrect={() => void controller.enterCorrection()}
            onToggleListening={() => controller.toggleListening()}
            onNewMatch={() => void controller.startNewMatchVoiceSetup()}
            onDisplayNameChange={(team, value) =>
              controller.updateDisplayName(team, value)
            }
            onServingTeamChange={(team) => controller.changeServingTeam(team)}
          />
          {snapshot.phase === 'correction' && (
            <CorrectionPanel
              teamA={snapshot.display.teams.A.name}
              teamB={snapshot.display.teams.B.name}
              pointsA={snapshot.display.teams.A.points}
              pointsB={snapshot.display.teams.B.points}
              isTieBreak={snapshot.display.isTieBreak}
              message={snapshot.message}
              onConfirm={(pointsA, pointsB) =>
                void controller.confirmCorrection(pointsA, pointsB)
              }
              onCancel={() => controller.cancelCorrection()}
            />
          )}
        </>
      )}
      {diagnosticsEnabled && (
        <VoiceDiagnostics
          snapshot={snapshot}
          wakeLock={wakeLockSnapshot}
          synthesis={synthesis}
          onStrategyChange={(strategy) => {
            strategyStore.save(strategy)
            controller.setListeningStrategy(strategy)
          }}
          onReset={() => controller.resetVoiceMetrics()}
        />
      )}
    </main>
  )
}
