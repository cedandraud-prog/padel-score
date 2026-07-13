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
import { WakeLockWarning } from './ui/WakeLockWarning'
import { browserListeningStrategyStore } from './voice/ListeningStrategy'

const strategyStore = browserListeningStrategyStore()
const diagnosticsEnabled = new URLSearchParams(window.location.search).has(
  'diagnostics',
)

export default function App() {
  const [synthesis] = useState(() => new SpeechSynthesisService())
  const [controller] = useState(
    () =>
      new MatchController(
        new SpeechRecognitionService(),
        synthesis,
        new CommandFeedbackService(synthesis),
        undefined,
        new ReadinessCueService(),
        strategyStore.load(),
      ),
  )
  const [snapshot, setSnapshot] = useState<MatchControllerSnapshot>(() =>
    controller.getSnapshot(),
  )
  const [wakeLockManager] = useState(() => new ScreenWakeLockManager())
  const [wakeLockSnapshot, setWakeLockSnapshot] = useState(() =>
    wakeLockManager.getSnapshot(),
  )

  useEffect(() => {
    controller.beginConfigurationExperience()
    const unsubscribe = controller.subscribe(setSnapshot)
    controller.listenForNewMatch()
    return () => {
      unsubscribe()
      controller.destroy()
    }
  }, [controller])

  useEffect(
    () => wakeLockManager.subscribe(setWakeLockSnapshot),
    [wakeLockManager],
  )

  useEffect(() => {
    void wakeLockManager.setExperienceActive(snapshot.experience.active)
  }, [snapshot.experience.active, wakeLockManager])

  useEffect(
    () => () => {
      void wakeLockManager.destroy()
    },
    [wakeLockManager],
  )

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
          onDismiss={() => wakeLockManager.dismissWarning()}
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
