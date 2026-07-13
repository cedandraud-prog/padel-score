import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultMatchConfiguration } from '../application/matchConfiguration'
import { VoiceMatchSetup } from '../application/VoiceMatchSetup'
import { MatchSetup } from './MatchSetup'

describe('MatchSetup', () => {
  it('affiche la commande Nouveau match et le vocabulaire Consigne vocale', () => {
    const html = renderToStaticMarkup(
      <MatchSetup
        message=""
        configuration={createDefaultMatchConfiguration()}
        voiceSetup={null}
        onConfigurationChange={() => undefined}
        onVoiceSetup={() => undefined}
        onRestartConfiguration={() => undefined}
      />,
    )

    expect(html).toContain('« Nouveau match »')
    expect(html).toContain('Consigne vocale équipe A')
    expect(html).toContain('Consigne vocale équipe B')
    expect(html).not.toContain('Dites <strong>« Recommencer »</strong>')
    expect(html).not.toContain('Démarrer le match')
    expect(html).not.toContain('Nom vocal')
    expect(html).not.toContain('class="restart-configuration"')
  })

  it('affiche le bouton tactile Recommencer à chaque étape vocale', () => {
    const setup = new VoiceMatchSetup()
    const snapshots = [setup.start().snapshot]
    for (const transcript of [
      'Champions',
      'Rouge',
      'Rouge',
      'Baltringues',
      'Bleu',
      'Bleu',
      'Rouge',
    ]) {
      snapshots.push(setup.handle(transcript).snapshot)
    }

    expect(snapshots.map(({ step }) => step)).toEqual([
      'team-a-display-name',
      'team-a-voice-name',
      'team-a-validation',
      'team-b-display-name',
      'team-b-voice-name',
      'team-b-validation',
      'server',
      'confirmation',
    ])

    for (const voiceSetup of snapshots) {
      const html = renderToStaticMarkup(
        <MatchSetup
          message=""
          configuration={voiceSetup.configuration}
          voiceSetup={voiceSetup}
          onConfigurationChange={() => undefined}
          onVoiceSetup={() => undefined}
          onRestartConfiguration={() => undefined}
        />,
      )
      expect(html).toContain('class="restart-configuration"')
      expect(html).toContain('>Recommencer</button>')
      expect(html).toContain(
        'Efface la configuration en cours et reprend depuis le début.',
      )
    }
  })
})
