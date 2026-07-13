import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpeechRecognitionService } from './SpeechRecognitionService'
import type { RecognitionHandlers } from './speechTypes'

class BrowserRecognitionMock {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 0
  onresult = null
  onstart: (() => void) | null = null
  onerror = null
  onend: (() => void) | null = null
  readonly start = vi.fn()
  readonly abort = vi.fn()
}

function handlers(): RecognitionHandlers {
  return {
    onStart: vi.fn(),
    onDiagnostic: vi.fn(),
    onResult: vi.fn(),
    onError: vi.fn(),
    onEnd: vi.fn(),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SpeechRecognitionService', () => {
  it('protège un démarrage déjà en cours', () => {
    const recognition = new BrowserRecognitionMock()
    vi.stubGlobal('window', {
      webkitSpeechRecognition: class {
        constructor() {
          return recognition
        }
      },
    })
    const service = new SpeechRecognitionService()

    service.start(handlers())
    service.start(handlers())

    expect(recognition.start).toHaveBeenCalledOnce()
  })

  it('conserve une seule session technique active après onstart', () => {
    const recognition = new BrowserRecognitionMock()
    vi.stubGlobal('window', {
      webkitSpeechRecognition: class {
        constructor() {
          return recognition
        }
      },
    })
    const service = new SpeechRecognitionService()

    service.start(handlers())
    recognition.onstart?.()
    service.start(handlers())

    expect(recognition.start).toHaveBeenCalledOnce()
  })

  it('classe InvalidStateError comme une erreur récupérable', () => {
    const recognition = new BrowserRecognitionMock()
    recognition.start.mockImplementation(() => {
      throw new DOMException('already started', 'InvalidStateError')
    })
    vi.stubGlobal('window', {
      webkitSpeechRecognition: class {
        constructor() {
          return recognition
        }
      },
    })
    const service = new SpeechRecognitionService()
    const callbacks = handlers()

    service.start(callbacks)

    expect(callbacks.onError).toHaveBeenCalledWith(
      'invalid-state',
      'La reconnaissance vocale redémarre.',
    )
  })
})
