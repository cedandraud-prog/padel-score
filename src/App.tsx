import { useState } from 'react'
import { ScoreEngine } from './core/ScoreEngine'
import type { DisplayState, TeamId } from './core/matchTypes'

export default function App() {
  const [engine] = useState(() => new ScoreEngine())
  const [match, setMatch] = useState<DisplayState>(() =>
    engine.getDisplayState(),
  )

  const awardPoint = (team: TeamId) => {
    engine.awardPoint(team)
    setMatch(engine.getDisplayState())
  }

  return (
    <main>
      <h1>PADEL SCORE</h1>
      <p>
        {match.teams.A.name} — Sets : {match.teams.A.sets}, Jeux :{' '}
        {match.teams.A.games}, Points : {match.teams.A.points}
      </p>
      <p>
        {match.teams.B.name} — Sets : {match.teams.B.sets}, Jeux :{' '}
        {match.teams.B.games}, Points : {match.teams.B.points}
      </p>
      <div>
        <button type="button" onClick={() => awardPoint('A')}>
          Point équipe A
        </button>
        <button type="button" onClick={() => awardPoint('B')}>
          Point équipe B
        </button>
      </div>
    </main>
  )
}
