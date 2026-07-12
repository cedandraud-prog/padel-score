import type { SynthesisAdapter } from './speechTypes'

export class SpeechSynthesisService implements SynthesisAdapter {
  readonly isSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window

  speak(text: string): Promise<void> {
    if (!this.isSupported) {
      return Promise.reject(
        new Error('Synthèse vocale indisponible dans ce navigateur.'),
      )
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'fr-FR'
      const frenchVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLocaleLowerCase().startsWith('fr'))
      if (frenchVoice) utterance.voice = frenchVoice
      utterance.onend = () => resolve()
      utterance.onerror = (event) =>
        reject(new Error(`Erreur de synthèse vocale : ${event.error}.`))
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    })
  }

  cancel(): void {
    if (this.isSupported) window.speechSynthesis.cancel()
  }
}
