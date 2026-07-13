import { describe, expect, it, vi } from 'vitest'
import { SpeechSynthesisService } from './SpeechSynthesisService'

function voice(
  name: string,
  lang: string,
  voiceURI: string,
  isDefault = false,
): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI,
    default: isDefault,
    localService: true,
  }
}

function createHarness() {
  const voices = [
    voice('English', 'en-US', 'english'),
    voice('Français A', 'fr-FR', 'french-a', true),
    voice('Français B', 'fr-CA', 'french-b'),
  ]
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  const utterances: SpeechSynthesisUtterance[] = []
  const synthesis = {
    getVoices: () => voices,
    cancel: vi.fn(),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      utterances.push(utterance)
      utterance.onend?.({} as SpeechSynthesisEvent)
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis
  const utteranceFactory = (text: string) =>
    ({ text, lang: '', voice: null }) as SpeechSynthesisUtterance
  const service = new SpeechSynthesisService(
    synthesis,
    storage,
    utteranceFactory,
  )
  return { service, storage, synthesis, utterances }
}

describe('SpeechSynthesisService', () => {
  it('inventorie uniquement les voix françaises disponibles', () => {
    const { service } = createHarness()
    expect(service.getFrenchVoices()).toEqual([
      {
        id: 'french-a',
        name: 'Français A',
        lang: 'fr-FR',
        isDefault: true,
        isLocal: true,
      },
      {
        id: 'french-b',
        name: 'Français B',
        lang: 'fr-CA',
        isDefault: false,
        isLocal: true,
      },
    ])
  })

  it('mémorise une voix française et l’utilise pour les annonces', async () => {
    const { service, utterances } = createHarness()
    expect(service.selectVoice('french-b')).toBe(true)

    await service.speak('Nouveau score')

    expect(service.getCurrentVoice()?.id).toBe('french-b')
    expect(utterances[0].voice?.voiceURI).toBe('french-b')
  })

  it('refuse de sélectionner une voix non française ou inconnue', () => {
    const { service } = createHarness()
    expect(service.selectVoice('english')).toBe(false)
    expect(service.selectVoice('inconnue')).toBe(false)
    expect(service.getCurrentVoice()?.id).toBe('french-a')
  })

  it('permet de tester la voix choisie', async () => {
    const { service, utterances } = createHarness()
    await service.testVoice('french-b')
    expect(utterances[0].text).toBe('Test de la voix PADEL SCORE.')
    expect(utterances[0].voice?.voiceURI).toBe('french-b')
  })
})
