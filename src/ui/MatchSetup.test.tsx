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
        microphoneStatus="listening"
        onDisplayNameChange={() => undefined}
        onVoiceSetup={() => undefined}
        onRestartConfiguration={() => undefined}
      />,
    )

    expect(html).toContain(
      '<section class="setup-primary-action" aria-label="Action principale">',
    )
    expect(html).toContain('<strong>« Nouveau match »</strong>')
    expect(html).toContain('Écoute active')
    expect(html.match(/Consigne vocale/g)).toHaveLength(2)
    expect(html).toContain('En attente…')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Démarrer le match')
    expect(html).not.toContain('Nom vocal')
    expect(html).not.toContain('class="restart-configuration"')

    expect(html.indexOf('Configurer le match')).toBeLessThan(
      html.indexOf('« Nouveau match »'),
    )
    expect(html.indexOf('« Nouveau match »')).toBeLessThan(
      html.indexOf('Écoute active'),
    )
    expect(html.indexOf('Écoute active')).toBeLessThan(
      html.indexOf('Informations reconnues'),
    )
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
          microphoneStatus="listening"
          onDisplayNameChange={() => undefined}
          onVoiceSetup={() => undefined}
          onRestartConfiguration={() => undefined}
        />,
      )
      expect(html).toContain('class="restart-configuration"')
      expect(html).toContain('>Recommencer</button>')
      expect(html).not.toContain('Efface la configuration en cours')
      expect(html.indexOf('Question en cours')).toBeLessThan(
        html.indexOf('Informations reconnues'),
      )
      expect(html.indexOf('Informations reconnues')).toBeLessThan(
        html.indexOf('>Recommencer</button>'),
      )
    }
  })

  it('restitue les valeurs vocales avec une édition ciblée du nom affiché', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions du monde très motivés')
    const voiceSetup = setup.handle('Rouge').snapshot

    const html = renderToStaticMarkup(
      <MatchSetup
        message=""
        configuration={voiceSetup.configuration}
        voiceSetup={voiceSetup}
        microphoneStatus="speaking"
        onDisplayNameChange={() => undefined}
        onVoiceSetup={() => undefined}
        onRestartConfiguration={() => undefined}
      />,
    )

    expect(html).toContain('Champions Du Monde Très Motivés')
    expect(html).toContain('Modifier le nom affiché de l’équipe 1')
    expect(html).toContain('<output>Rouge</output>')
    expect(html).toContain('Annonce en cours')
    expect(html).not.toContain('<input')
  })
})
