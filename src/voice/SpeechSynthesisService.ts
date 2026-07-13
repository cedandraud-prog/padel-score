import type { SynthesisAdapter } from './speechTypes'

const VOICE_STORAGE_KEY = 'padel-score.speech-voice'

type VoiceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type UtteranceFactory = (text: string) => SpeechSynthesisUtterance

export interface SpeechVoiceOption {
  id: string
  name: string
  lang: string
  isDefault: boolean
  isLocal: boolean
}

function browserSynthesis(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null
}

function browserStorage(): VoiceStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function browserUtteranceFactory(): UtteranceFactory | null {
  return typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window
    ? (text) => new SpeechSynthesisUtterance(text)
    : null
}

function voiceId(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || `${voice.name}|${voice.lang}`
}

function toOption(voice: SpeechSynthesisVoice): SpeechVoiceOption {
  return {
    id: voiceId(voice),
    name: voice.name,
    lang: voice.lang,
    isDefault: voice.default,
    isLocal: voice.localService,
  }
}

export class SpeechSynthesisService implements SynthesisAdapter {
  readonly isSupported: boolean

  constructor(
    private readonly synthesis = browserSynthesis(),
    private readonly storage = browserStorage(),
    private readonly utteranceFactory = browserUtteranceFactory(),
  ) {
    this.isSupported = synthesis !== null && utteranceFactory !== null
  }

  getFrenchVoices(): SpeechVoiceOption[] {
    return this.frenchBrowserVoices().map(toOption)
  }

  getCurrentVoice(): SpeechVoiceOption | null {
    const voice = this.resolveVoice()
    return voice ? toOption(voice) : null
  }

  selectVoice(id: string | null): boolean {
    if (
      id !== null &&
      !this.frenchBrowserVoices().some((voice) => voiceId(voice) === id)
    ) {
      return false
    }

    try {
      if (id === null) this.storage?.removeItem(VOICE_STORAGE_KEY)
      else this.storage?.setItem(VOICE_STORAGE_KEY, id)
      return true
    } catch {
      return false
    }
  }

  subscribeToVoiceChanges(listener: () => void): () => void {
    if (!this.synthesis) return () => undefined
    this.synthesis.addEventListener('voiceschanged', listener)
    return () => this.synthesis?.removeEventListener('voiceschanged', listener)
  }

  speak(text: string): Promise<void> {
    return this.speakWithVoice(text, this.resolveVoice())
  }

  testVoice(id: string): Promise<void> {
    const voice = this.frenchBrowserVoices().find(
      (candidate) => voiceId(candidate) === id,
    )
    if (!voice) {
      return Promise.reject(new Error('Voix française indisponible.'))
    }
    return this.speakWithVoice('Test de la voix PADEL SCORE.', voice)
  }

  cancel(): void {
    this.synthesis?.cancel()
  }

  private frenchBrowserVoices(): SpeechSynthesisVoice[] {
    return (
      this.synthesis
        ?.getVoices()
        .filter((voice) => voice.lang.toLocaleLowerCase().startsWith('fr')) ??
      []
    )
  }

  private selectedVoiceId(): string | null {
    try {
      return this.storage?.getItem(VOICE_STORAGE_KEY) ?? null
    } catch {
      return null
    }
  }

  private resolveVoice(): SpeechSynthesisVoice | null {
    const voices = this.frenchBrowserVoices()
    const selected = this.selectedVoiceId()
    return (
      voices.find((voice) => voiceId(voice) === selected) ?? voices[0] ?? null
    )
  }

  private speakWithVoice(
    text: string,
    voice: SpeechSynthesisVoice | null,
  ): Promise<void> {
    if (!this.isSupported || !this.synthesis || !this.utteranceFactory) {
      return Promise.reject(
        new Error('Synthèse vocale indisponible dans ce navigateur.'),
      )
    }

    return new Promise((resolve, reject) => {
      const utterance = this.utteranceFactory?.(text)
      if (!utterance) {
        reject(new Error('Synthèse vocale indisponible dans ce navigateur.'))
        return
      }
      utterance.lang = 'fr-FR'
      if (voice) utterance.voice = voice
      utterance.onend = () => resolve()
      utterance.onerror = (event) =>
        reject(new Error(`Erreur de synthèse vocale : ${event.error}.`))
      this.synthesis?.cancel()
      this.synthesis?.speak(utterance)
    })
  }
}
