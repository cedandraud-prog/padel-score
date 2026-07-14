import { useEffect, useRef, useState } from 'react'
import {
  MatchController,
  type MatchControllerSnapshot,
} from './application/MatchController'
import { CorrectionPanel } from './ui/CorrectionPanel'
import { MatchScreen } from './ui/MatchScreen'
import { MatchSetup } from './ui/MatchSetup'
import { InitialServerSelection } from './ui/InitialServerSelection'
import { VoiceDiagnostics } from './ui/VoiceDiagnostics'
import { SpeechRecognitionService } from './voice/SpeechRecognitionService'
import {
  SpeechSynthesisService,
  type SpeechVoiceOption,
} from './voice/SpeechSynthesisService'
import { CommandFeedbackService } from './voice/CommandFeedbackService'
import { ReadinessCueService } from './voice/ReadinessCueService'
import { ScreenWakeLockManager } from './application/ScreenWakeLockManager'
import type { ScreenWakeLockSnapshot } from './application/ScreenWakeLockManager'
import { WakeLockWarning } from './ui/WakeLockWarning'
import { browserListeningStrategyStore } from './voice/ListeningStrategy'
import {
  applyPlayerCommandDictation,
  applyPlayerPlusDictation,
  copyPlayerPlusConfigurationDraft,
  createPlayerPlusConfigurationDraft,
  getNextMissingSetupField,
  playerPlusConfigurationToDraft,
  toPlayerMatchConfiguration,
  toPlayerPlusMatchConfiguration,
  type PlayerPlusConfigurationDraft,
  type PlayerCommandDictationField,
  type SetupDictationField,
  type SetupDictationTrace,
  type SetupMode,
} from './application/setupConfiguration'
import type { FeedbackMode } from './voice/speechTypes'
import type { PlayerId } from './core/playerPlusService'
import type { TeamId } from './core/matchTypes'
import { normalizeSpeech } from './voice/normalizeSpeech'
import { IndexedDbMatchRepository } from './application/MatchRepository'
import {
  MatchPersistenceService,
  requestPersistentStorage,
} from './application/MatchPersistenceService'
import {
  createMatchRecord,
  isMatchSetupDraftSnapshot,
  MATCH_PERSISTENCE_SCHEMA_VERSION,
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
  const [announcementVoices, setAnnouncementVoices] = useState<
    SpeechVoiceOption[]
  >(() => synthesis.getVoiceOptions())
  const [selectedAnnouncementVoiceId, setSelectedAnnouncementVoiceId] =
    useState(() => synthesis.getSelectedVoiceId())
  const [announcementVoiceTesting, setAnnouncementVoiceTesting] =
    useState(false)
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
  const postArchiveAction = useRef<'CHANGE_TEAMS' | null>(null)
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
  const [, setSetupDictationTrace] = useState<SetupDictationTrace | null>(null)
  const activeDictationField = useRef<SetupDictationField | null>(null)
  const playerPlusConfigurationRef = useRef(playerPlusConfiguration)
  const dictationAttemptSequence = useRef(0)
  const activeDictationAttempt = useRef<number | null>(null)
  const activeDictationReceived = useRef(false)
  const ambiguousSetupPlayerIds = useRef<readonly PlayerId[]>([])
  const [pendingStart, setPendingStart] = useState<{
    mode: SetupMode
    feedbackMode: FeedbackMode
  } | null>(null)
  const [initialServerListening, setInitialServerListening] = useState(false)
  const [initialServerMessage, setInitialServerMessage] = useState('')
  const initialServerCandidates = useRef<readonly PlayerId[]>([])
  const resumeControllerListeningAfterSetupDictation = useRef(false)
  const resumeControllerListeningAfterCommandEdit = useRef(false)
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
    const refreshVoices = () => {
      setAnnouncementVoices(synthesis.getVoiceOptions())
      setSelectedAnnouncementVoiceId(synthesis.getSelectedVoiceId())
    }
    refreshVoices()
    return synthesis.subscribeToVoiceChanges(refreshVoices)
  }, [synthesis])

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
            postArchiveAction.current = null
            return
          }
          setRecapRecord(record)
          setHistoryRecords((current) =>
            current
              ? [record, ...current.filter(({ id }) => id !== record.id)]
              : current,
          )
          if (postArchiveAction.current === 'CHANGE_TEAMS') {
            postArchiveAction.current = null
            activeController.prepareNewMatch()
            activeMatchMetadata.current = null
            lastSavedRevision.current = null
            archivingMatchId.current = null
            setRecapRecord(null)
            activeController.beginConfigurationExperience()
            if (record.configuration.mode === 'PLAYER') {
              setSetupMode('PLAYER')
              activeController.updateEditingConfiguration(record.configuration)
            } else {
              const draft = playerPlusConfigurationToDraft(record.configuration)
              playerPlusConfigurationRef.current = draft
              setPlayerPlusConfiguration(draft)
              setSetupMode('PLAYERS_PLUS')
            }
          }
        })
      }
    })
    setController(activeController)
    void requestPersistentStorage()
    void Promise.all([
      persistence.loadActiveSession(),
      persistence.loadSetupDraft(),
    ]).then(([activeSession, setupDraft]) => {
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
        if (isMatchSetupDraftSnapshot(setupDraft)) {
          setSetupMode(setupDraft.mode)
          activeController.updateEditingConfiguration(setupDraft.player)
          playerPlusConfigurationRef.current = setupDraft.playerPlus
          setPlayerPlusConfiguration(setupDraft.playerPlus)
        }
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
    if (
      !persistenceReady ||
      pendingRestore ||
      !snapshot ||
      (snapshot.phase !== 'setup' && snapshot.phase !== 'voice-setup')
    ) {
      return
    }
    void persistence.saveSetupDraft({
      schemaVersion: MATCH_PERSISTENCE_SCHEMA_VERSION,
      mode: setupMode,
      player: snapshot.editingConfiguration,
      playerPlus: playerPlusConfiguration,
      updatedAt: new Date().toISOString(),
    })
  }, [
    pendingRestore,
    persistence,
    persistenceReady,
    playerPlusConfiguration,
    setupMode,
    snapshot,
  ])

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
      return
    }
    if (record.configuration.mode === 'PLAYER') {
      setSetupMode('PLAYER')
      controller.updateEditingConfiguration(record.configuration)
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
    setupDictation?.stop()
    activeDictationAttempt.current = null
    activeDictationReceived.current = false
    activeDictationField.current = null
    setDictationField(null)
    setSetupMessage('')
    ambiguousSetupPlayerIds.current = []
    setSetupDictationTrace(null)
    setSetupMode(nextMode)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }))
  }

  const finishSetupDictation = (attemptId: number) => {
    if (activeDictationAttempt.current !== attemptId) return
    activeDictationAttempt.current = null
    activeDictationField.current = null
    setDictationField(null)
    if (resumeControllerListeningAfterSetupDictation.current) {
      resumeControllerListeningAfterSetupDictation.current = false
      controller.enableListening()
    }
  }

  const cancelSetupDictation = () => {
    if (activeDictationField.current === null) return
    setupDictation?.stop()
  }

  const dictateSetupField = (field: SetupDictationField) => {
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
    resumeControllerListeningAfterSetupDictation.current =
      snapshot.conversation.isRunning
    if (resumeControllerListeningAfterSetupDictation.current) {
      controller.disableListening()
    }
    setDictationField(field)
    setSetupMessage('')
    const draftBefore = copyPlayerPlusConfigurationDraft(
      playerPlusConfigurationRef.current,
    )
    const stepBefore = getNextMissingSetupField(draftBefore)
    if (setupMode === 'PLAYERS_PLUS') {
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
    }

    setupDictation.start({
      onStart: () => undefined,
      onDiagnostic: () => undefined,
      onResult: ({ transcript }) => {
        if (activeDictationAttempt.current !== attemptId) return
        activeDictationReceived.current = true
        if (setupMode === 'PLAYER') {
          const result = applyPlayerCommandDictation(
            controller.getSnapshot().editingConfiguration,
            field as PlayerCommandDictationField,
            transcript,
          )
          if (result.accepted) {
            controller.updateEditingConfiguration(result.configuration)
          }
          setSetupMessage(result.rejectionReason)
          setupDictation.stop()
          return
        }
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
        finishSetupDictation(attemptId)
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
        finishSetupDictation(attemptId)
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

  const startPlayerMatch = (feedbackMode: FeedbackMode) => {
    setInitialServerMessage('')
    setPendingStart({ mode: 'PLAYER', feedbackMode })
  }

  const startPlayerPlusMatch = (feedbackMode: FeedbackMode) => {
    setInitialServerMessage('')
    setPendingStart({ mode: 'PLAYERS_PLUS', feedbackMode })
  }

  const completePlayerStart = (servingTeam: TeamId) => {
    if (pendingStart?.mode !== 'PLAYER') return
    initialServerCandidates.current = []
    const started = controller.startConfiguredMatch({
      configuration: toPlayerMatchConfiguration(
        snapshot.editingConfiguration,
        servingTeam,
      ),
      feedbackMode: pendingStart.feedbackMode,
    })
    if (!started) {
      setInitialServerMessage('La configuration du match est invalide.')
      return
    }
    setPendingStart(null)
    void persistence.deleteSetupDraft()
  }

  const completePlayerPlusStart = (firstServer: PlayerId) => {
    if (pendingStart?.mode !== 'PLAYERS_PLUS') return
    const result = toPlayerPlusMatchConfiguration(
      playerPlusConfigurationRef.current,
      firstServer,
    )
    if (!result.ok) {
      setInitialServerMessage(result.reason)
      return
    }
    const started = controller.startConfiguredMatch({
      configuration: result.configuration,
      feedbackMode: pendingStart.feedbackMode,
    })
    if (!started) {
      setInitialServerMessage('La configuration du match est invalide.')
      return
    }
    initialServerCandidates.current = []
    setPendingStart(null)
    void persistence.deleteSetupDraft()
  }

  const listenForInitialServer = () => {
    if (!setupDictation?.isSupported || initialServerListening) {
      setInitialServerMessage(
        setupDictation?.isSupported
          ? 'Une réponse vocale est déjà en cours.'
          : 'La dictée vocale est indisponible dans ce navigateur.',
      )
      return
    }
    setInitialServerMessage('')
    setInitialServerListening(true)
    setupDictation.start({
      onStart: () => undefined,
      onDiagnostic: () => undefined,
      onResult: ({ transcript }) => {
        const normalized = normalizeSpeech(transcript)
        if (pendingStart?.mode === 'PLAYER') {
          const matches = (['A', 'B'] as const).filter((team) => {
            const configured =
              team === 'A'
                ? snapshot.editingConfiguration.teamA
                : snapshot.editingConfiguration.teamB
            return [configured.displayName, configured.voiceName].some(
              (value) => normalizeSpeech(value) === normalized,
            )
          })
          if (matches.length === 1) completePlayerStart(matches[0])
          else
            setInitialServerMessage(
              'Équipe non reconnue. Choisissez-la à l’écran.',
            )
        } else if (pendingStart?.mode === 'PLAYERS_PLUS') {
          const candidates = initialServerCandidates.current
          if (
            candidates.length > 1 &&
            (normalized === 'gauche' || normalized === 'droite')
          ) {
            const side = normalized === 'gauche' ? 'LEFT' : 'RIGHT'
            const player = [
              ...playerPlusConfigurationRef.current.teamA.players,
              ...playerPlusConfigurationRef.current.teamB.players,
            ].find(
              ({ id, side: playerSide }) =>
                candidates.includes(id) && playerSide === side,
            )
            if (player) completePlayerPlusStart(player.id)
          } else {
            const players = [
              ...playerPlusConfigurationRef.current.teamA.players,
              ...playerPlusConfigurationRef.current.teamB.players,
            ]
            const matches = players.filter(
              ({ name }) => normalizeSpeech(name) === normalized,
            )
            if (matches.length === 1) completePlayerPlusStart(matches[0].id)
            else if (matches.length > 1) {
              initialServerCandidates.current = matches.map(({ id }) => id)
              setInitialServerMessage(
                'Plusieurs joueurs portent ce nom. Dites gauche ou droite.',
              )
            } else {
              setInitialServerMessage(
                'Joueur non reconnu. Choisissez-le à l’écran.',
              )
            }
          }
        }
        setupDictation.stop()
      },
      onError: (_code, message) => {
        setInitialServerMessage(message)
        setInitialServerListening(false)
      },
      onEnd: () => {
        setInitialServerListening(false)
        if (initialServerCandidates.current.length > 1) {
          window.setTimeout(listenForInitialServer, 0)
        }
      },
    })
  }

  const changeCommandEditState = (editing: boolean) => {
    if (editing) {
      resumeControllerListeningAfterCommandEdit.current =
        snapshot.conversation.isRunning
      if (resumeControllerListeningAfterCommandEdit.current) {
        controller.disableListening()
      }
      return
    }
    if (resumeControllerListeningAfterCommandEdit.current) {
      resumeControllerListeningAfterCommandEdit.current = false
      controller.enableListening()
    }
  }

  const selectAnnouncementVoice = (voiceId: string) => {
    if (!synthesis.selectVoice(voiceId)) return
    setSelectedAnnouncementVoiceId(synthesis.getSelectedVoiceId())
  }

  const previewAnnouncementVoice = async () => {
    if (announcementVoiceTesting || !synthesis.isSupported) return
    setAnnouncementVoiceTesting(true)
    try {
      await controller.previewAnnouncementVoice()
    } finally {
      setAnnouncementVoiceTesting(false)
    }
  }

  const changeTeams = () => {
    if (
      !window.confirm(
        'Changer les équipes terminera et archivera ce match. Continuer ?',
      )
    ) {
      return
    }
    postArchiveAction.current = 'CHANGE_TEAMS'
    void controller.finishSession().then((finished) => {
      if (!finished) postArchiveAction.current = null
    })
  }

  const isMatchSetup =
    snapshot.phase === 'setup' || snapshot.phase === 'voice-setup'
  const isMatchScreen =
    persistenceReady &&
    !pendingRestore &&
    !recapRecord &&
    !historyRecords &&
    !isMatchSetup

  return (
    <main
      className={`app-shell${isMatchSetup ? ' app-shell--setup' : ''}${isMatchScreen ? ' app-shell--match' : ''}`}
    >
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
          {pendingStart ? (
            <InitialServerSelection
              mode={pendingStart.mode}
              playerConfiguration={snapshot.editingConfiguration}
              playerPlusConfiguration={playerPlusConfiguration}
              listening={initialServerListening}
              message={initialServerMessage}
              onSelectTeam={completePlayerStart}
              onSelectPlayer={completePlayerPlusStart}
              onListen={listenForInitialServer}
              onCancel={() => {
                setupDictation?.stop()
                initialServerCandidates.current = []
                setInitialServerListening(false)
                setInitialServerMessage('')
                setPendingStart(null)
              }}
            />
          ) : (
            <MatchSetup
              message={setupMessage || (dictationField ? '' : snapshot.message)}
              mode={setupMode}
              configuration={snapshot.editingConfiguration}
              playerPlusConfiguration={playerPlusConfiguration}
              microphoneStatus={
                dictationField ? 'listening' : snapshot.microphoneStatus
              }
              dictationField={dictationField}
              onModeChange={changeSetupMode}
              onConfigurationChange={(configuration) =>
                controller.updateEditingConfiguration(configuration)
              }
              onPlayerPlusConfigurationChange={updatePlayerPlusConfiguration}
              onDictate={dictateSetupField}
              onCancelDictation={cancelSetupDictation}
              announcementVoices={announcementVoices}
              selectedAnnouncementVoiceId={selectedAnnouncementVoiceId}
              announcementVoiceSupported={synthesis.isSupported}
              announcementVoiceTesting={announcementVoiceTesting}
              onAnnouncementVoiceChange={selectAnnouncementVoice}
              onTestAnnouncementVoice={() => void previewAnnouncementVoice()}
              onStartPlayerMatch={startPlayerMatch}
              onStartPlayerPlusMatch={startPlayerPlusMatch}
            />
          )}
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
            onVoiceNameChange={(team, value) =>
              controller.updateVoiceName(team, value)
            }
            onCommandEditStateChange={changeCommandEditState}
            onChangeTeams={changeTeams}
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
            onRequestSessionFinish={() =>
              void controller.handleTranscript({ transcript: 'Fin de match' })
            }
            onConfirmSessionFinish={() =>
              void controller.handleTranscript({ transcript: 'Oui' })
            }
            onCancelSessionFinish={() =>
              void controller.handleTranscript({ transcript: 'Non' })
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
          onTestAnnouncementVoice={() => controller.previewAnnouncementVoice()}
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
