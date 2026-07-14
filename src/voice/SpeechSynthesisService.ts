import type { SynthesisAdapter, SynthesisLifecycle } from './speechTypes'
import { ANNOUNCEMENT_VOICE_TEST_PHRASE } from './speechTypes'

const VOICE_STORAGE_KEY = 'padel-score.speech-voice'
export const AUTOMATIC_VOICE_ID = 'automatic'

type VoiceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type UtteranceFactory = (text: string) => SpeechSynthesisUtterance

export interface SpeechVoiceOption {
  id: string
  voiceURI: string
  name: string
  lang: string
  isDefault: boolean
  isLocal: boolean
  isAutomatic: boolean
}

interface StoredVoicePreference {
  voiceURI: string
  name: string
  lang: string
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
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    isDefault: voice.default,
    isLocal: voice.localService,
    isAutomatic: false,
  }
}

const AUTOMATIC_VOICE_OPTION: SpeechVoiceOption = {
  id: AUTOMATIC_VOICE_ID,
  voiceURI: '',
  name: 'Automatique',
  lang: '',
  isDefault: true,
  isLocal: true,
  isAutomatic: true,
}

export class SpeechSynthesisService implements SynthesisAdapter {
  readonly isSupported: boolean
  private cancelActiveSpeech: (() => void) | null = null

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

  getVoiceOptions(): SpeechVoiceOption[] {
    return [AUTOMATIC_VOICE_OPTION, ...this.getFrenchVoices()]
  }

  getSelectedVoiceId(): string {
    const selected = this.resolveStoredVoice()
    return selected ? voiceId(selected) : AUTOMATIC_VOICE_ID
  }

  getCurrentVoice(): SpeechVoiceOption | null {
    const voice = this.resolveVoice()
    return voice ? toOption(voice) : null
  }

  selectVoice(id: string): boolean {
    if (id === AUTOMATIC_VOICE_ID) {
      try {
        this.storage?.removeItem(VOICE_STORAGE_KEY)
        return true
      } catch {
        return false
      }
    }

    const selected = this.frenchBrowserVoices().find(
      (voice) => voiceId(voice) === id,
    )
    if (!selected) {
      return false
    }

    try {
      this.storage?.setItem(
        VOICE_STORAGE_KEY,
        JSON.stringify({
          voiceURI: selected.voiceURI,
          name: selected.name,
          lang: selected.lang,
        } satisfies StoredVoicePreference),
      )
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

  speak(text: string, lifecycle?: SynthesisLifecycle): Promise<void> {
    return this.speakWithVoice(text, this.resolveVoice(), lifecycle)
  }

  testVoice(id = this.getSelectedVoiceId()): Promise<void> {
    const voice =
      id === AUTOMATIC_VOICE_ID
        ? this.defaultFrenchVoice()
        : (this.frenchBrowserVoices().find(
            (candidate) => voiceId(candidate) === id,
          ) ?? null)
    if (id !== AUTOMATIC_VOICE_ID && !voice) {
      return Promise.reject(new Error('Voix française indisponible.'))
    }
    return this.speakWithVoice(ANNOUNCEMENT_VOICE_TEST_PHRASE, voice)
  }

  cancel(): void {
    this.cancelActiveSpeech?.()
    this.synthesis?.cancel()
  }

  private frenchBrowserVoices(): SpeechSynthesisVoice[] {
    const voices =
      this.synthesis
        ?.getVoices()
        .filter((voice) => voice.lang.toLocaleLowerCase().startsWith('fr')) ??
      []
    const unique = new Map<string, SpeechSynthesisVoice>()
    for (const voice of voices) {
      const key = voice.voiceURI || `${voice.name}|${voice.lang}`
      const current = unique.get(key)
      if (!current || (!current.default && voice.default))
        unique.set(key, voice)
    }
    return [...unique.values()].sort((left, right) => {
      const group = (voice: SpeechSynthesisVoice) =>
        voice.default ? 0 : voice.lang.toLocaleLowerCase() === 'fr-fr' ? 1 : 2
      return (
        group(left) - group(right) ||
        left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' })
      )
    })
  }

  private storedPreference(): StoredVoicePreference | null {
    try {
      const stored = this.storage?.getItem(VOICE_STORAGE_KEY)
      if (!stored) return null
      try {
        const parsed = JSON.parse(stored) as Partial<StoredVoicePreference>
        return typeof parsed.voiceURI === 'string' &&
          typeof parsed.name === 'string' &&
          typeof parsed.lang === 'string'
          ? {
              voiceURI: parsed.voiceURI,
              name: parsed.name,
              lang: parsed.lang,
            }
          : null
      } catch {
        return { voiceURI: stored, name: '', lang: '' }
      }
    } catch {
      return null
    }
  }

  private resolveStoredVoice(): SpeechSynthesisVoice | null {
    const voices = this.frenchBrowserVoices()
    const preference = this.storedPreference()
    if (!preference) return null
    return (
      voices.find((voice) => voice.voiceURI === preference.voiceURI) ??
      voices.find(
        (voice) =>
          voice.name === preference.name && voice.lang === preference.lang,
      ) ??
      null
    )
  }

  private defaultFrenchVoice(): SpeechSynthesisVoice | null {
    return this.frenchBrowserVoices()[0] ?? null
  }

  private resolveVoice(): SpeechSynthesisVoice | null {
    return this.resolveStoredVoice() ?? this.defaultFrenchVoice()
  }

  private speakWithVoice(
    text: string,
    voice: SpeechSynthesisVoice | null,
    lifecycle?: SynthesisLifecycle,
  ): Promise<void> {
    if (!this.isSupported || !this.synthesis || !this.utteranceFactory) {
      return Promise.reject(
        new Error('Synthèse vocale indisponible dans ce navigateur.'),
      )
    }

    this.cancel()

    return new Promise((resolve, reject) => {
      const utterance = this.utteranceFactory?.(text)
      if (!utterance) {
        reject(new Error('Synthèse vocale indisponible dans ce navigateur.'))
        return
      }
      utterance.lang = 'fr-FR'
      if (voice) utterance.voice = voice
      let settled = false
      const finish = (callback: () => void, error?: Error) => {
        if (settled) return
        settled = true
        if (this.cancelActiveSpeech === cancelSpeech) {
          this.cancelActiveSpeech = null
        }
        callback()
        if (error) reject(error)
        else resolve()
      }
      const cancelSpeech = () => finish(() => lifecycle?.onCancelled?.())

      this.cancelActiveSpeech = cancelSpeech
      utterance.onstart = () => lifecycle?.onStarted?.()
      utterance.onend = () => finish(() => lifecycle?.onEnded?.())
      utterance.onerror = (event) => {
        if (event.error === 'canceled' || event.error === 'interrupted') {
          finish(() => lifecycle?.onCancelled?.())
          return
        }
        finish(
          () => lifecycle?.onError?.(event.error),
          new Error(`Erreur de synthèse vocale : ${event.error}.`),
        )
      }
      this.synthesis?.speak(utterance)
    })
  }
}
