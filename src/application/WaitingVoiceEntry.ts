import { resolveVoiceCommand } from '../voice/commandAliases'
import { normalizeSpeech } from '../voice/normalizeSpeech'

export type WaitingVoiceEntryResult =
  | { type: 'START_NEW_MATCH'; normalizedTranscript: string }
  | { type: 'IGNORED'; normalizedTranscript: string; reason: string }

export class WaitingVoiceEntry {
  interpret(transcript: string): WaitingVoiceEntryResult {
    const normalizedTranscript = normalizeSpeech(transcript)
    if (resolveVoiceCommand(normalizedTranscript)?.type === 'NEW_MATCH') {
      return { type: 'START_NEW_MATCH', normalizedTranscript }
    }
    return {
      type: 'IGNORED',
      normalizedTranscript,
      reason: normalizedTranscript
        ? 'Seule la commande exacte « Nouveau match » est disponible.'
        : 'Transcription vide.',
    }
  }
}
