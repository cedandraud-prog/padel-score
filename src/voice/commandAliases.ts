type CommandAliasKey =
  | 'score'
  | 'full-score'
  | 'undo'
  | 'correct'
  | 'stop-listening'
  | 'resume-listening'
  | 'finish-match'
  | 'confirm'
  | 'new-match'

export type VoiceCommand =
  | { type: 'SCORE' }
  | { type: 'FULL_SCORE' }
  | { type: 'UNDO' }
  | { type: 'START_CORRECTION' }
  | { type: 'CORRECT_POINTS_INLINE'; spokenScore: string }
  | { type: 'STOP_LISTENING' }
  | { type: 'RESUME_LISTENING' }
  | { type: 'FINISH_MATCH' }
  | { type: 'CONFIRM' }
  | { type: 'NEW_MATCH' }

export const COMMAND_ALIASES = {
  score: ['score'],
  'full-score': ['score complet'],
  undo: ['annule', 'annuler', 'annulee', 'annulez'],
  correct: ['corrige', 'corriger', 'corrigez'],
  'stop-listening': ['termine ecoute'],
  'resume-listening': ['reprends ecoute'],
  'finish-match': ['fin de match'],
  confirm: ['confirmer'],
  'new-match': ['nouveau match'],
} as const satisfies Record<CommandAliasKey, readonly string[]>

export const ALL_COMMAND_ALIASES: readonly string[] =
  Object.values(COMMAND_ALIASES).flat()

const EXACT_COMMANDS: ReadonlyArray<{
  aliases: readonly string[]
  command: VoiceCommand
}> = [
  { aliases: COMMAND_ALIASES.score, command: { type: 'SCORE' } },
  { aliases: COMMAND_ALIASES['full-score'], command: { type: 'FULL_SCORE' } },
  { aliases: COMMAND_ALIASES.undo, command: { type: 'UNDO' } },
  {
    aliases: COMMAND_ALIASES['stop-listening'],
    command: { type: 'STOP_LISTENING' },
  },
  {
    aliases: COMMAND_ALIASES['resume-listening'],
    command: { type: 'RESUME_LISTENING' },
  },
  {
    aliases: COMMAND_ALIASES['finish-match'],
    command: { type: 'FINISH_MATCH' },
  },
  { aliases: COMMAND_ALIASES.confirm, command: { type: 'CONFIRM' } },
  { aliases: COMMAND_ALIASES['new-match'], command: { type: 'NEW_MATCH' } },
]

export function resolveVoiceCommand(
  normalizedTranscript: string,
): VoiceCommand | null {
  for (const alias of COMMAND_ALIASES.correct) {
    if (normalizedTranscript === alias) return { type: 'START_CORRECTION' }
    const prefix = `${alias} `
    if (normalizedTranscript.startsWith(prefix)) {
      return {
        type: 'CORRECT_POINTS_INLINE',
        spokenScore: normalizedTranscript.slice(prefix.length),
      }
    }
  }

  for (const entry of EXACT_COMMANDS) {
    if (entry.aliases.some((alias) => alias === normalizedTranscript)) {
      return entry.command
    }
  }
  return null
}
