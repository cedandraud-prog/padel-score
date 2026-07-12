import { useState, type FormEvent } from 'react'
import type { DisplayPoint } from '../core/matchTypes'

interface CorrectionPanelProps {
  teamA: string
  teamB: string
  pointsA: DisplayPoint
  pointsB: DisplayPoint
  isTieBreak: boolean
  message: string
  onConfirm(pointsA: number, pointsB: number): void
  onCancel(): void
}

const normalPointOptions = [
  { value: 0, label: '0' },
  { value: 1, label: '15' },
  { value: 2, label: '30' },
  { value: 3, label: '40 / égalité' },
  { value: 4, label: 'Avantage' },
]

function rawPoint(value: DisplayPoint): number {
  if (typeof value === 'number') return value
  if (value === '15') return 1
  if (value === '30') return 2
  if (value === '40' || value === 'Égalité') return 3
  if (value === 'Avantage') return 4
  return 0
}

export function CorrectionPanel({
  teamA,
  teamB,
  pointsA: displayedA,
  pointsB: displayedB,
  isTieBreak,
  message,
  onConfirm,
  onCancel,
}: CorrectionPanelProps) {
  const [pointsA, setPointsA] = useState(() => rawPoint(displayedA))
  const [pointsB, setPointsB] = useState(() => rawPoint(displayedB))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onConfirm(pointsA, pointsB)
  }

  const pointField = (
    team: string,
    value: number,
    setValue: (value: number) => void,
  ) => (
    <label>
      Points — {team}
      {isTieBreak ? (
        <input
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
        />
      ) : (
        <select
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
        >
          {normalPointOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </label>
  )

  return (
    <section
      className="panel correction-panel"
      aria-labelledby="correction-title"
    >
      <h2 id="correction-title">Correction des points</h2>
      <p>Les commandes d’équipe sont ignorées jusqu’à la sortie de ce mode.</p>
      <form onSubmit={submit}>
        {pointField(teamA, pointsA, setPointsA)}
        {pointField(teamB, pointsB, setPointsB)}
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="primary">
            Confirmer la correction
          </button>
          <button type="button" onClick={onCancel}>
            Annuler la correction
          </button>
        </div>
      </form>
    </section>
  )
}
