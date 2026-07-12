export const MINIMUM_RECOGNITION_CONFIDENCE = 0.65

export type VoiceErrorCode =
  | 'not-allowed'
  | 'audio-capture'
  | 'network'
  | 'no-speech'
  | 'aborted'
  | 'unknown'

export interface SpeechTranscript {
  transcript: string
  confidence?: number
}

export interface RecognitionResultDiagnostics {
  rawTranscript: string
  rawConfidence: number | null
  isFinal: boolean
  resultsLength: number
  resultIndex: number
}

export function usableRecognitionConfidence(
  confidence: number | undefined,
): number | undefined {
  return confidence !== undefined &&
    Number.isFinite(confidence) &&
    confidence > 0 &&
    confidence <= 1
    ? confidence
    : undefined
}

export interface RecognitionHandlers {
  onDiagnostic(diagnostics: RecognitionResultDiagnostics): void
  onResult(result: SpeechTranscript): void
  onError(code: VoiceErrorCode, message: string): void
  onEnd(): void
}

export interface RecognitionAdapter {
  readonly isSupported: boolean
  start(handlers: RecognitionHandlers): void
  stop(): void
  dispose(): void
}

export interface SynthesisAdapter {
  readonly isSupported: boolean
  speak(text: string): Promise<void>
  cancel(): void
}
