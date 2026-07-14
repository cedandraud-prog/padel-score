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
  onaudiostart: (() => void) | null = null
  onspeechstart: (() => void) | null = null
  onspeechend: (() => void) | null = null
  onerror = null
  onend: (() => void) | null = null
  readonly start = vi.fn()
  readonly abort = vi.fn()
}

function handlers(): RecognitionHandlers {
  return {
    onStart: vi.fn(),
    onAudioStart: vi.fn(),
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
  it('distingue le démarrage du moteur du début réel de capture audio', () => {
    const recognition = new BrowserRecognitionMock()
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
    recognition.onstart?.()

    expect(callbacks.onStart).toHaveBeenCalledOnce()
    expect(callbacks.onAudioStart).not.toHaveBeenCalled()

    recognition.onaudiostart?.()

    expect(callbacks.onAudioStart).toHaveBeenCalledOnce()
  })

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

  it('identifie le fallback onstart lorsque audiostart n’est pas exposé', () => {
    const recognition = new BrowserRecognitionMock()
    delete (recognition as { onaudiostart?: (() => void) | null }).onaudiostart
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
    recognition.onstart?.()

    expect(callbacks.onAudioStart).toHaveBeenCalledWith('onstart-fallback')
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
