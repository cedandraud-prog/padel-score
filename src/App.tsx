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

export default function App() {
  const [controller] = useState(() => {
    const synthesis = new SpeechSynthesisService()
    return new MatchController(
      new SpeechRecognitionService(),
      synthesis,
      new CommandFeedbackService(synthesis),
      undefined,
      new ReadinessCueService(),
    )
  })
  const [snapshot, setSnapshot] = useState<MatchControllerSnapshot>(() =>
    controller.getSnapshot(),
  )

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot)
    controller.listenForNewMatch()
    return () => {
      unsubscribe()
      controller.destroy()
    }
  }, [controller])

  const startMatch = (
    configuration: MatchConfiguration,
    feedbackMode: FeedbackMode,
  ) => {
    controller.startMatch({ configuration, feedbackMode })
  }

  return (
    <main className="app-shell">
      <header>
        <h1>PADEL SCORE</h1>
        <p>Vous jouez. Le système se souvient.</p>
      </header>

      {snapshot.phase === 'setup' || snapshot.phase === 'voice-setup' ? (
        <>
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
          <VoiceDiagnostics snapshot={snapshot} />
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
    </main>
  )
}
