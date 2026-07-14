import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultMatchConfiguration } from '../application/matchConfiguration'
import {
  createPlayerPlusConfigurationDraft,
  updatePlayerName,
} from '../application/setupConfiguration'
import { InitialServerSelection } from './InitialServerSelection'

const callbacks = {
  onSelectTeam: () => undefined,
  onSelectPlayer: () => undefined,
  onListen: () => undefined,
  onCancel: () => undefined,
}

describe('InitialServerSelection', () => {
  it('demande le serveur PLAYER seulement après la configuration', () => {
    const html = renderToStaticMarkup(
      <InitialServerSelection
        {...callbacks}
        mode="PLAYER"
        playerConfiguration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        listening={false}
        message=""
      />,
    )

    expect(html).toContain('Quelle équipe sert en premier ?')
    expect(html).toContain('Équipe 1')
    expect(html).toContain('Équipe 2')
  })

  it('distingue les homonymes PLAYER+ par leur côté', () => {
    let draft = createPlayerPlusConfigurationDraft()
    draft = updatePlayerName(draft, 'A1', 'Camille')
    draft = updatePlayerName(draft, 'A2', 'Camille')
    draft = updatePlayerName(draft, 'B1', 'Alex')
    draft = updatePlayerName(draft, 'B2', 'Sam')
    const html = renderToStaticMarkup(
      <InitialServerSelection
        {...callbacks}
        mode="PLAYERS_PLUS"
        playerConfiguration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={draft}
        listening={false}
        message=""
      />,
    )

    expect(html).toContain('Camille<small> — gauche</small>')
    expect(html).toContain('Camille<small> — droite</small>')
  })
})
