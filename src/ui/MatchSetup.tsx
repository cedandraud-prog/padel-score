import { useState, type FormEvent } from 'react'
import type { TeamId, TeamNames } from '../core/matchTypes'
import { validateTeamNames } from '../voice/normalizeSpeech'

interface MatchSetupProps {
  message: string
  onStart(teamNames: TeamNames, servingTeam: TeamId): void
}

export function MatchSetup({ message, onStart }: MatchSetupProps) {
  const [nameA, setNameA] = useState('Équipe A')
  const [nameB, setNameB] = useState('Équipe B')
  const [servingTeam, setServingTeam] = useState<TeamId>('A')
  const [validationMessage, setValidationMessage] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const error = validateTeamNames(nameA, nameB)
    if (error) {
      setValidationMessage(error)
      return
    }
    setValidationMessage('')
    onStart({ A: nameA, B: nameB }, servingTeam)
  }

  return (
    <section className="panel setup-panel" aria-labelledby="setup-title">
      <h2 id="setup-title">Configurer le match</h2>
      <form onSubmit={submit}>
        <label>
          Nom équipe A
          <input
            value={nameA}
            onChange={(event) => setNameA(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Nom équipe B
          <input
            value={nameB}
            onChange={(event) => setNameB(event.target.value)}
            autoComplete="off"
          />
        </label>
        <fieldset>
          <legend>Équipe au service</legend>
          <label className="choice">
            <input
              type="radio"
              name="server"
              checked={servingTeam === 'A'}
              onChange={() => setServingTeam('A')}
            />
            Équipe A
          </label>
          <label className="choice">
            <input
              type="radio"
              name="server"
              checked={servingTeam === 'B'}
              onChange={() => setServingTeam('B')}
            />
            Équipe B
          </label>
        </fieldset>
        {(validationMessage || message) && (
          <p className="error" role="alert">
            {validationMessage || message}
          </p>
        )}
        <button type="submit" className="primary">
          Démarrer le match
        </button>
      </form>
    </section>
  )
}
