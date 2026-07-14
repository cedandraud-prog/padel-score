import { describe, expect, it, vi } from 'vitest'
import {
  AUTOMATIC_VOICE_ID,
  SpeechSynthesisService,
} from './SpeechSynthesisService'
import { ANNOUNCEMENT_VOICE_TEST_PHRASE } from './speechTypes'

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

function createHarness(
  initialVoices: SpeechSynthesisVoice[] = [
    voice('English', 'en-US', 'english'),
    voice('Français Canada', 'fr-CA', 'french-ca'),
    voice('Français B', 'fr-FR', 'french-b'),
    voice('Français A', 'fr-FR', 'french-a', true),
    voice('Doublon ignoré', 'fr-FR', 'french-b'),
  ],
) {
  let voices = initialVoices
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  const utterances: SpeechSynthesisUtterance[] = []
  const voiceListeners = new Set<() => void>()
  const synthesis = {
    getVoices: () => voices,
    cancel: vi.fn(),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      utterances.push(utterance)
      utterance.onstart?.({} as SpeechSynthesisEvent)
      utterance.onend?.({} as SpeechSynthesisEvent)
    }),
    addEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'voiceschanged') voiceListeners.add(listener)
    }),
    removeEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'voiceschanged') voiceListeners.delete(listener)
    }),
  } as unknown as SpeechSynthesis
  const utteranceFactory = (text: string) =>
    ({ text, lang: '', voice: null }) as SpeechSynthesisUtterance
  const service = new SpeechSynthesisService(
    synthesis,
    storage,
    utteranceFactory,
  )
  return {
    service,
    storage,
    synthesis,
    utteranceFactory,
    utterances,
    values,
    setVoices(next: SpeechSynthesisVoice[]) {
      voices = next
    },
    emitVoicesChanged() {
      voiceListeners.forEach((listener) => listener())
    },
  }
}

describe('SpeechSynthesisService', () => {
  it('ajoute Automatique, filtre, déduplique et trie les voix françaises', () => {
    const { service } = createHarness()

    expect(service.getVoiceOptions().map(({ id }) => id)).toEqual([
      AUTOMATIC_VOICE_ID,
      'french-a',
      'french-b',
      'french-ca',
    ])
    expect(service.getVoiceOptions()[0]).toMatchObject({
      name: 'Automatique',
      isAutomatic: true,
    })
  })

  it('charge une liste initialement vide à la réception de voiceschanged', () => {
    const harness = createHarness([])
    const listener = vi.fn()
    const unsubscribe = harness.service.subscribeToVoiceChanges(listener)

    expect(harness.service.getVoiceOptions()).toHaveLength(1)
    harness.setVoices([voice('Français A', 'fr-FR', 'french-a', true)])
    harness.emitVoicesChanged()

    expect(listener).toHaveBeenCalledOnce()
    expect(harness.service.getVoiceOptions()).toHaveLength(2)
    unsubscribe()
    harness.emitVoicesChanged()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('mémorise voiceURI, name et lang puis utilise cette voix partout', async () => {
    const { service, utterances, values } = createHarness()
    expect(service.selectVoice('french-b')).toBe(true)

    await service.speak('Nouveau score')
    await service.speak('Confirmation')

    expect(JSON.parse([...values.values()][0])).toEqual({
      voiceURI: 'french-b',
      name: 'Français B',
      lang: 'fr-FR',
    })
    expect(utterances.map((utterance) => utterance.voice?.voiceURI)).toEqual([
      'french-b',
      'french-b',
    ])
  })

  it('restaure la préférence après actualisation', async () => {
    const harness = createHarness()
    harness.service.selectVoice('french-b')
    const restoredService = new SpeechSynthesisService(
      harness.synthesis,
      harness.storage,
      harness.utteranceFactory,
    )

    expect(restoredService.getSelectedVoiceId()).toBe('french-b')
    await restoredService.speak('Score après actualisation')
    expect(harness.utterances.at(-1)?.voice?.voiceURI).toBe('french-b')
  })

  it('restaure la voix par name + lang lorsque voiceURI a changé', async () => {
    const harness = createHarness()
    harness.service.selectVoice('french-b')
    harness.setVoices([
      voice('Français A', 'fr-FR', 'french-a', true),
      voice('Français B', 'fr-FR', 'french-b-new'),
    ])

    expect(harness.service.getSelectedVoiceId()).toBe('french-b-new')
    await harness.service.speak('Score')
    expect(harness.utterances[0].voice?.voiceURI).toBe('french-b-new')
  })

  it('revient silencieusement à Automatique si la voix disparaît', async () => {
    const harness = createHarness()
    harness.service.selectVoice('french-b')
    harness.setVoices([voice('Français A', 'fr-FR', 'french-a', true)])

    expect(harness.service.getSelectedVoiceId()).toBe(AUTOMATIC_VOICE_ID)
    await harness.service.speak('Score')
    expect(harness.utterances[0].voice?.voiceURI).toBe('french-a')
  })

  it('permet de revenir explicitement à Automatique', () => {
    const { service, values } = createHarness()
    service.selectVoice('french-b')

    expect(service.selectVoice(AUTOMATIC_VOICE_ID)).toBe(true)
    expect(values.size).toBe(0)
    expect(service.getSelectedVoiceId()).toBe(AUTOMATIC_VOICE_ID)
  })

  it('refuse de sélectionner une voix non française ou inconnue', () => {
    const { service } = createHarness()
    expect(service.selectVoice('english')).toBe(false)
    expect(service.selectVoice('inconnue')).toBe(false)
    expect(service.getSelectedVoiceId()).toBe(AUTOMATIC_VOICE_ID)
  })

  it('prononce la phrase de test avec la voix sélectionnée', async () => {
    const { service, utterances } = createHarness()
    service.selectVoice('french-b')

    await service.testVoice()

    expect(utterances[0].text).toBe(ANNOUNCEMENT_VOICE_TEST_PHRASE)
    expect(utterances[0].voice?.voiceURI).toBe('french-b')
  })

  it('signale le démarrage et la fin réels de l’annonce', async () => {
    const { service } = createHarness()
    const events: string[] = []

    await service.speak('Nouveau score', {
      onStarted: () => events.push('started'),
      onEnded: () => events.push('ended'),
    })

    expect(events).toEqual(['started', 'ended'])
  })

  it('reste non bloquant lorsque la synthèse est indisponible', async () => {
    const service = new SpeechSynthesisService(null, null, null)

    expect(service.isSupported).toBe(false)
    expect(service.getVoiceOptions()).toHaveLength(1)
    await expect(service.speak('Score')).rejects.toThrow(
      'Synthèse vocale indisponible',
    )
  })
})
