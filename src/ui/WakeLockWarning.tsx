interface WakeLockWarningProps {
  message: string
  onDismiss: () => void
}

export function WakeLockWarning({ message, onDismiss }: WakeLockWarningProps) {
  return (
    <aside className="wake-lock-warning" role="status">
      <p>{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Masquer l’avertissement"
      >
        Fermer
      </button>
    </aside>
  )
}
