import { useEffect, useState } from 'react'
import {
  MatchController,
  type MatchControllerSnapshot,
} from './application/MatchController'
import type { MatchConfiguration } from './application/matchConfiguration'
import { CorrectionPanel } from './ui/CorrectionPanel'
import { MatchScreen } from './ui/MatchScreen'
import { MatchSetup } from './ui/MatchSetup'
import { VoiceDiagnostics } from './ui/VoiceDiagnostics'
import { SpeechRecognitionService } from './voice/SpeechRecognitionService'
import { SpeechSynthesisService } from './voice/SpeechSynthesisService'
import { CommandFeedbackService } from './voice/CommandFeedbackService'
import { ReadinessCueService } from './voice/ReadinessCueService'
import type { FeedbackMode } from './voice/speechTypes'
import { ScreenWakeLockManager } from './application/ScreenWakeLockManager'
import { WakeLockWarning } from './ui/WakeLockWarning'
import { browserListeningStrategyStore } from './voice/ListeningStrategy'

const strategyStore = browserListeningStrategyStore()
const diagnosticsEnabled = new URLSearchParams(window.location.search).has(
  'diagnostics',
)

export default function App() {
  const [controller] = useState(() => {
    const synthesis = new SpeechSynthesisService()
    return new MatchController(
      new SpeechRecognitionService(),
      synthesis,
      new CommandFeedbackService(synthesis),
      undefined,
      new ReadinessCueService(),
      strategyStore.load(),
    )
  })
  const [snapshot, setSnapshot] = useState<MatchControllerSnapshot>(() =>
    controller.getSnapshot(),
  )
  const [wakeLockManager] = useState(() => new ScreenWakeLockManager())
  const [wakeLockSnapshot, setWakeLockSnapshot] = useState(() =>
    wakeLockManager.getSnapshot(),
  )

  useEffect(() => {
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

  const startMatch = (
    configuration: MatchConfiguration,
    feedbackMode: FeedbackMode,
  ) => {
    controller.startConfiguredMatch({ configuration, feedbackMode })
  }

  return (
    <main className="app-shell">
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

      {snapshot.phase === 'setup' || snapshot.phase === 'voice-setup' ? (
        <>
          <div onFocusCapture={() => controller.beginConfigurationExperience()}>
            <MatchSetup
              message={snapshot.message}
              configuration={snapshot.editingConfiguration}
              voiceSetup={snapshot.voiceSetup}
              onConfigurationChange={(configuration) =>
                controller.updateEditingConfiguration(configuration)
              }
              onStart={startMatch}
              onVoiceSetup={(feedbackMode) =>
                void controller.startNewMatchVoiceSetup(feedbackMode)
              }
            />
          </div>
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
