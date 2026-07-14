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
  playerPlusConfigurationToDraft,
  setupModeHasData,
  toPlayerPlusMatchConfiguration,
  type PlayerPlusConfigurationDraft,
  type SetupDictationField,
  type SetupDictationTrace,
  type SetupMode,
} from './application/setupConfiguration'
import type { FeedbackMode } from './voice/speechTypes'
import type { PlayerId } from './core/playerPlusService'
import { IndexedDbMatchRepository } from './application/MatchRepository'
import {
  MatchPersistenceService,
  requestPersistentStorage,
} from './application/MatchPersistenceService'
import {
  createMatchRecord,
  type MatchRecord,
  type MatchSessionSnapshot,
} from './application/matchPersistence'
import { RestoreSessionPrompt } from './ui/RestoreSessionPrompt'
import { MatchRecap } from './ui/MatchRecap'
import { MatchHistory } from './ui/MatchHistory'

const strategyStore = browserListeningStrategyStore()
const diagnosticsEnabled = new URLSearchParams(window.location.search).has(
  'diagnostics',
)

export default function App() {
  const [persistenceWarning, setPersistenceWarning] = useState('')
  const [persistence] = useState(
    () =>
      new MatchPersistenceService(
        new IndexedDbMatchRepository(),
        setPersistenceWarning,
      ),
  )
  const [synthesis] = useState(() => new SpeechSynthesisService())
  const [controller, setController] = useState<MatchController | null>(null)
  const [snapshot, setSnapshot] = useState<MatchControllerSnapshot | null>(null)
  const [persistenceReady, setPersistenceReady] = useState(false)
  const [pendingRestore, setPendingRestore] =
    useState<MatchSessionSnapshot | null>(null)
  const [recapRecord, setRecapRecord] = useState<MatchRecord | null>(null)
  const [historyRecords, setHistoryRecords] = useState<MatchRecord[] | null>(
    null,
  )
  const activeMatchMetadata = useRef<{
    id: string
    createdAt: string
    startedAt: string
  } | null>(null)
  const lastSavedRevision = useRef<number | null>(null)
  const archivingMatchId = useRef<string | null>(null)
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
  const ambiguousSetupPlayerIds = useRef<readonly PlayerId[]>([])
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
    let cancelled = false
    const activeController = new MatchController(
      new SpeechRecognitionService(),
      synthesis,
      new CommandFeedbackService(synthesis),
      undefined,
      new ReadinessCueService(),
      strategyStore.load(),
    )
    const unsubscribe = activeController.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot)
      if (nextSnapshot.session.state === 'NOT_STARTED') return

      if (!activeMatchMetadata.current) {
        const startedAt = new Date().toISOString()
        activeMatchMetadata.current = {
          id: createMatchId(),
          createdAt: startedAt,
          startedAt,
        }
      }
      const metadata = activeMatchMetadata.current
      const persistentSnapshot = activeController.createMatchSessionSnapshot({
        ...metadata,
      })
      if (!persistentSnapshot) return

      if (nextSnapshot.session.state === 'IN_PROGRESS') {
        if (lastSavedRevision.current === nextSnapshot.durableRevision) return
        const revision = nextSnapshot.durableRevision
        lastSavedRevision.current = revision
        void persistence.saveActiveSession(persistentSnapshot).then((saved) => {
          if (!saved && lastSavedRevision.current === revision) {
            lastSavedRevision.current = null
          }
        })
        return
      }

      if (
        nextSnapshot.session.state === 'FINISHED' &&
        archivingMatchId.current !== metadata.id
      ) {
        archivingMatchId.current = metadata.id
        const record = createMatchRecord(persistentSnapshot, 'FINISHED')
        void persistence.archive(record).then((archived) => {
          if (!archived || cancelled) {
            archivingMatchId.current = null
            return
          }
          setRecapRecord(record)
          setHistoryRecords((current) =>
            current
              ? [record, ...current.filter(({ id }) => id !== record.id)]
              : current,
          )
        })
      }
    })
    setController(activeController)
    void requestPersistentStorage()
    void persistence.loadActiveSession().then((activeSession) => {
      if (cancelled) return
      if (activeSession) {
        activeMatchMetadata.current = {
          id: activeSession.id,
          createdAt: activeSession.createdAt,
          startedAt: activeSession.startedAt,
        }
        setPendingRestore(activeSession)
      } else {
        activeController.beginConfigurationExperience()
        activeController.listenForNewMatch()
      }
      setPersistenceReady(true)
    })
    return () => {
      cancelled = true
      unsubscribe()
      activeController.destroy()
    }
  }, [persistence, synthesis])

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

  useEffect(() => {
    if (snapshot?.phase !== 'voice-setup' || setupMode !== 'PLAYERS_PLUS') {
      return
    }
    const emptyPlayerPlus = createPlayerPlusConfigurationDraft()
    playerPlusConfigurationRef.current = emptyPlayerPlus
    setPlayerPlusConfiguration(emptyPlayerPlus)
    ambiguousSetupPlayerIds.current = []
    setSetupMode('PLAYER')
  }, [snapshot?.phase, setupMode])

  if (!controller || !snapshot) return null

  const resumePendingSession = () => {
    if (!pendingRestore) return
    activeMatchMetadata.current = {
      id: pendingRestore.id,
      createdAt: pendingRestore.createdAt,
      startedAt: pendingRestore.startedAt,
    }
    lastSavedRevision.current = null
    if (controller.restoreMatchSession(pendingRestore)) {
      setPendingRestore(null)
    }
  }

  const abandonPendingSession = () => {
    if (!pendingRestore) return
    const record = createMatchRecord(pendingRestore, 'ABANDONED')
    void persistence.archive(record).then((archived) => {
      if (!archived) return
      setPendingRestore(null)
      activeMatchMetadata.current = null
      lastSavedRevision.current = null
      controller.prepareNewMatch()
      controller.beginConfigurationExperience()
      controller.listenForNewMatch()
    })
  }

  const resumeRecord = (record: MatchRecord) => {
    void persistence.reopen(record).then((reopened) => {
      if (!reopened) return
      activeMatchMetadata.current = {
        id: record.id,
        createdAt: record.createdAt,
        startedAt: record.startedAt,
      }
      lastSavedRevision.current = null
      archivingMatchId.current = null
      if (controller.restoreMatchSession(record.reopenSnapshot)) {
        setRecapRecord(null)
        setHistoryRecords(null)
      }
    })
  }

  const returnToConfiguration = (record?: MatchRecord) => {
    controller.prepareNewMatch()
    activeMatchMetadata.current = null
    lastSavedRevision.current = null
    archivingMatchId.current = null
    setRecapRecord(null)
    setHistoryRecords(null)
    controller.beginConfigurationExperience()

    if (!record) {
      setSetupMode('PLAYER')
      controller.listenForNewMatch()
      return
    }
    if (record.configuration.mode === 'PLAYER') {
      setSetupMode('PLAYER')
      controller.updateEditingConfiguration(record.configuration)
      controller.listenForNewMatch()
      return
    }
    const draft = playerPlusConfigurationToDraft(record.configuration)
    playerPlusConfigurationRef.current = draft
    setPlayerPlusConfiguration(draft)
    setSetupMode('PLAYERS_PLUS')
  }

  const openHistory = () => {
    void persistence.listMatches().then(setHistoryRecords)
  }

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
    ambiguousSetupPlayerIds.current = []
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
    if (field !== 'servingPlayerId') ambiguousSetupPlayerIds.current = []
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
          ambiguousSetupPlayerIds.current,
        )
        ambiguousSetupPlayerIds.current = result.ambiguousPlayerIds ?? []
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
    ambiguousSetupPlayerIds.current = []
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

  const startPlayerPlusMatch = (feedbackMode: FeedbackMode) => {
    const result = toPlayerPlusMatchConfiguration(playerPlusConfiguration)
    if (!result.ok) {
      setSetupMessage(result.reason)
      return
    }
    controller.startConfiguredMatch({
      configuration: result.configuration,
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

      {persistenceWarning && (
        <aside className="persistence-warning" role="status">
          <span>La sauvegarde locale est temporairement indisponible.</span>
          <button type="button" onClick={() => setPersistenceWarning('')}>
            Fermer
          </button>
        </aside>
      )}

      {!persistenceReady ? (
        <p className="persistence-loading">Recherche d’un match en cours…</p>
      ) : pendingRestore ? (
        <RestoreSessionPrompt
          session={pendingRestore}
          onResume={resumePendingSession}
          onAbandon={abandonPendingSession}
        />
      ) : recapRecord ? (
        <MatchRecap
          record={recapRecord}
          onResume={() => resumeRecord(recapRecord)}
          onNewWithPlayers={() => returnToConfiguration(recapRecord)}
          onBackToSetup={() => returnToConfiguration()}
        />
      ) : historyRecords ? (
        <MatchHistory
          records={historyRecords}
          onOpen={setRecapRecord}
          onClose={() => setHistoryRecords(null)}
        />
      ) : isMatchSetup ? (
        <>
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
            onRestartConfiguration={() =>
              void controller.restartConfiguration()
            }
            onStartPlayerMatch={startPlayerMatch}
            onStartPlayerPlusMatch={startPlayerPlusMatch}
          />
          <button className="history-open" type="button" onClick={openHistory}>
            Historique des matchs
          </button>
        </>
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
            onRequestPlayerServerCorrection={() =>
              void controller.enterServerCorrection()
            }
            onSelectPlayerServer={(playerId) =>
              void controller.selectPlayerServer(playerId)
            }
            onCancelPlayerServerSelection={() =>
              controller.cancelPlayerServerSelection()
            }
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
      {diagnosticsEnabled && persistenceReady && !pendingRestore && (
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

function createMatchId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `match-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
