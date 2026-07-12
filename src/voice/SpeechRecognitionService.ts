import type {
  RecognitionAdapter,
  RecognitionHandlers,
  VoiceErrorCode,
} from './speechTypes'
import { usableRecognitionConfidence } from './speechTypes'

interface BrowserSpeechAlternative {
  transcript: string
  confidence?: number
}

interface BrowserSpeechResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: BrowserSpeechAlternative
}

interface BrowserSpeechResultList {
  readonly length: number
  [index: number]: BrowserSpeechResult
}

interface BrowserSpeechResultEvent extends Event {
  readonly resultIndex: number
  readonly results: BrowserSpeechResultList
}

interface BrowserSpeechErrorEvent extends Event {
  readonly error: string
  readonly message?: string
}

interface BrowserSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: BrowserSpeechResultEvent) => void) | null
  onstart: (() => void) | null
  onerror: ((event: BrowserSpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

function recognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as SpeechWindow
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  )
}

function mapError(code: string): {
  code: VoiceErrorCode
  message: string
} {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code: 'not-allowed',
        message:
          'Permission microphone refusée. Autorisez le microphone dans Chrome.',
      }
    case 'audio-capture':
      return {
        code: 'audio-capture',
        message:
          'Aucun microphone disponible. Vérifiez l’entrée audio Windows.',
      }
    case 'network':
      return {
        code: 'network',
        message: 'Erreur réseau du service de reconnaissance vocale.',
      }
    case 'no-speech':
      return { code: 'no-speech', message: 'Aucune parole détectée.' }
    case 'aborted':
      return { code: 'aborted', message: 'Reconnaissance interrompue.' }
    default:
      return { code: 'unknown', message: `Erreur de reconnaissance : ${code}.` }
  }
}

export class SpeechRecognitionService implements RecognitionAdapter {
  readonly isSupported: boolean
  private recognition: BrowserSpeechRecognition | null = null
  private active = false
  private starting = false

  constructor() {
    this.isSupported = recognitionConstructor() !== null
  }

  start(handlers: RecognitionHandlers): void {
    if (this.active || this.starting) return
    const Recognition = recognitionConstructor()
    if (!Recognition) {
      handlers.onError(
        'unknown',
        'Reconnaissance vocale indisponible. Utilisez Google Chrome ou les boutons de secours.',
      )
      return
    }

    const recognition = new Recognition()
    this.recognition = recognition
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex]
      const alternative = result?.[0]
      if (!result || !alternative) return
      const rawConfidence = alternative.confidence
      handlers.onDiagnostic({
        rawTranscript: alternative.transcript,
        rawConfidence: typeof rawConfidence === 'number' ? rawConfidence : null,
        isFinal: result.isFinal,
        resultsLength: event.results.length,
        resultIndex: event.resultIndex,
      })
      if (!result.isFinal) return
      handlers.onResult({
        transcript: alternative.transcript,
        confidence: usableRecognitionConfidence(rawConfidence),
      })
    }
    recognition.onstart = () => {
      if (this.recognition === recognition) {
        this.starting = false
        this.active = true
      }
      handlers.onStart()
    }
    recognition.onerror = (event) => {
      const error = mapError(event.error)
      if (error.code !== 'aborted') handlers.onError(error.code, error.message)
    }
    recognition.onend = () => {
      if (this.recognition === recognition) {
        this.starting = false
        this.active = false
      }
      handlers.onEnd()
    }

    try {
      this.starting = true
      recognition.start()
    } catch {
      this.starting = false
      this.active = false
      handlers.onError(
        'unknown',
        'Impossible de démarrer la reconnaissance vocale.',
      )
    }
  }

  stop(): void {
    if (!this.recognition || (!this.active && !this.starting)) return
    this.starting = false
    this.active = false
    this.recognition.abort()
  }

  dispose(): void {
    this.stop()
    if (this.recognition) {
      this.recognition.onresult = null
      this.recognition.onstart = null
      this.recognition.onerror = null
      this.recognition.onend = null
    }
    this.recognition = null
  }
}
