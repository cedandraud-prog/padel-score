import { useEffect, useState } from 'react'
import {
  MatchController,
  type MatchControllerSnapshot,
} from './application/MatchController'
import type { TeamId, TeamNames } from './core/matchTypes'
import { CorrectionPanel } from './ui/CorrectionPanel'
import { MatchScreen } from './ui/MatchScreen'
import { MatchSetup } from './ui/MatchSetup'
import { SpeechRecognitionService } from './voice/SpeechRecognitionService'
import { SpeechSynthesisService } from './voice/SpeechSynthesisService'

export default function App() {
  const [controller] = useState(
    () =>
      new MatchController(
        new SpeechRecognitionService(),
        new SpeechSynthesisService(),
      ),
  )
  const [snapshot, setSnapshot] = useState<MatchControllerSnapshot>(() =>
    controller.getSnapshot(),
  )

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot)
    return () => {
      unsubscribe()
      controller.destroy()
    }
  }, [controller])

  const startMatch = (teamNames: TeamNames, servingTeam: TeamId) => {
    controller.startMatch({ teamNames, servingTeam })
  }

  return (
    <main className="app-shell">
      <header>
        <h1>PADEL SCORE</h1>
        <p>Vous jouez. Le système se souvient.</p>
      </header>

      {snapshot.phase === 'setup' ? (
        <MatchSetup message={snapshot.message} onStart={startMatch} />
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
            onNewMatch={() => controller.prepareNewMatch()}
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
