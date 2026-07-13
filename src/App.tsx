import { useEffect, useState } from 'react'
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

const strategyStore = browserListeningStrategyStore()
const diagnosticsEnabled = new URLSearchParams(window.location.search).has(
  'diagnostics',
)

export default function App() {
  const [synthesis] = useState(() => new SpeechSynthesisService())
  const [controller, setController] = useState<MatchController | null>(null)
  const [snapshot, setSnapshot] = useState<MatchControllerSnapshot | null>(null)
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
          message={snapshot.message}
          configuration={snapshot.editingConfiguration}
          voiceSetup={snapshot.voiceSetup}
          microphoneStatus={snapshot.microphoneStatus}
          onVoiceSetup={(feedbackMode) =>
            void controller.startNewMatchVoiceSetup(feedbackMode)
          }
          onRestartConfiguration={() => void controller.restartConfiguration()}
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
