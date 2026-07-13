import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultMatchConfiguration } from '../application/matchConfiguration'
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
      />,
    )

    expect(html).toContain('« Nouveau match »')
    expect(html).toContain('Consigne vocale équipe A')
    expect(html).toContain('Consigne vocale équipe B')
    expect(html).toContain('« Recommencer »')
    expect(html).not.toContain('Démarrer le match')
    expect(html).not.toContain('Nom vocal')
  })
})
