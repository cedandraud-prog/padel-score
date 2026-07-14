import { useEffect, useState } from 'react'
import { PencilIcon } from './Icons'

interface EditableDisplayNameProps {
  value: string
  teamLabel: string
  onSave(value: string): void
  disabled?: boolean
}

export function EditableDisplayName({
  value,
  teamLabel,
  onSave,
  disabled = false,
}: EditableDisplayNameProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  const trimmedDraft = draft.trim()

  function save(): void {
    if (!trimmedDraft) return
    onSave(trimmedDraft)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        className="editable-team-name"
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Modifier le nom affiché de ${teamLabel}`}
        disabled={disabled}
      >
        <span>{value}</span>
        {!disabled && <PencilIcon className="inline-icon" />}
      </button>
    )
  }

  return (
    <div className="editable-team-name-form">
      <input
        aria-label={`Nom affiché de ${teamLabel}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save()
          if (event.key === 'Escape') setEditing(false)
        }}
        autoFocus
      />
      <button type="button" onClick={save} disabled={!trimmedDraft}>
        Valider
      </button>
      <button type="button" onClick={() => setEditing(false)}>
        Annuler
      </button>
    </div>
  )
}
