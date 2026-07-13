import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SpeechSynthesisService } from '../voice/SpeechSynthesisService'
import { VoiceSettingsDiagnostic } from './VoiceDiagnostics'

describe('VoiceSettingsDiagnostic', () => {
  it('limite la sélection de voix aux voix françaises du diagnostic', () => {
    const frenchVoice = {
      name: 'Voix française',
      lang: 'fr-FR',
      voiceURI: 'french',
      default: true,
      localService: true,
    } as SpeechSynthesisVoice
    const englishVoice = {
      ...frenchVoice,
      name: 'English voice',
      lang: 'en-US',
      voiceURI: 'english',
    }
    const synthesis = {
      getVoices: () => [frenchVoice, englishVoice],
      cancel: () => undefined,
      speak: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as SpeechSynthesis
    const service = new SpeechSynthesisService(
      synthesis,
      null,
      (text) => ({ text }) as SpeechSynthesisUtterance,
    )

    const html = renderToStaticMarkup(
      <VoiceSettingsDiagnostic synthesis={service} />,
    )

    expect(html).toContain('Voix des annonces')
    expect(html).toContain('Voix française')
    expect(html).not.toContain('English voice')
    expect(html).toContain('Tester cette voix')
  })
})
