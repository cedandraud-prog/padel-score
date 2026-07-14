import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultMatchConfiguration } from '../application/matchConfiguration'
import {
  createPlayerPlusConfigurationDraft,
  updatePlayerName,
} from '../application/setupConfiguration'
import { MatchSetup } from './MatchSetup'

const callbacks = {
  onModeChange: () => undefined,
  onConfigurationChange: () => undefined,
  onPlayerPlusConfigurationChange: () => undefined,
  onDictate: () => undefined,
  onCancelDictation: () => undefined,
  onStartPlayerMatch: () => undefined,
  onStartPlayerPlusMatch: () => undefined,
}

function render(mode: 'PLAYER' | 'PLAYERS_PLUS' = 'PLAYER') {
  return renderToStaticMarkup(
    <MatchSetup
      {...callbacks}
      message=""
      mode={mode}
      configuration={createDefaultMatchConfiguration()}
      playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
      microphoneStatus="inactive"
      dictationField={null}
    />,
  )
}

describe('MatchSetup', () => {
  it('expose deux boutons de mode avec un état actif accessible', () => {
    const playerHtml = render('PLAYER')
    const playerPlusHtml = render('PLAYERS_PLUS')

    expect(playerHtml).toContain(
      '<button type="button" aria-pressed="true">PLAYER</button>',
    )
    expect(playerHtml).toContain(
      '<button type="button" aria-pressed="false">PLAYER+</button>',
    )
    expect(playerPlusHtml).toContain(
      '<button type="button" aria-pressed="false">PLAYER</button>',
    )
    expect(playerPlusHtml).toContain(
      '<button type="button" aria-pressed="true">PLAYER+</button>',
    )
    expect(playerHtml).not.toContain('name="setup-mode"')
  })

  it('affiche une configuration PLAYER directe avec les valeurs par défaut', () => {
    const html = render()

    expect(html).toContain('<h3>Équipe 1</h3>')
    expect(html).toContain('<h3>Équipe 2</h3>')
    expect(html).toContain('aria-label="Renommer Équipe 1"')
    expect(html).toContain('value="Gagné"')
    expect(html).toContain('value="Perdu"')
    expect(html).toContain('Configuration prête')
    expect(html).toContain('Démarrer le match')
    expect(html).toContain('Dicter la commande de l’équipe 1')
    expect(html).toContain('Dicter la commande de l’équipe 2')
    expect(html).not.toContain('Qui sert')
  })

  it('affiche quatre emplacements fixes et la permutation en PLAYER+', () => {
    const html = render('PLAYERS_PLUS')

    expect(html).toContain('GAUCHE')
    expect(html).toContain('DROITE')
    expect(html.match(/pour un échange/g)).toHaveLength(4)
    expect(html).toContain('Inverser gauche et droite')
    expect(html.match(/aria-label="Dicter le prénom/g)).toHaveLength(4)
    expect(html.match(/aria-label="Dicter la commande/g)).toHaveLength(2)
    expect(html).not.toContain('Premier serveur')
    expect(html).not.toContain(' / ')
  })

  it('rend visible et annulable la dictée ciblée d’une commande', () => {
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYER"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        microphoneStatus="listening"
        dictationField="teamA.voiceName"
      />,
    )

    expect(html).toContain(
      'aria-label="Annuler la dictée de la commande de l’équipe 1"',
    )
    expect(html).toContain('aria-pressed="true"')
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Dicter la commande de l’équipe 2"/,
    )
  })

  it('active PLAYER+ lorsque les quatre joueurs et commandes sont valides', () => {
    let draft = createPlayerPlusConfigurationDraft()
    draft = updatePlayerName(draft, 'A1', 'Alice')
    draft = updatePlayerName(draft, 'A2', 'Chloé')
    draft = updatePlayerName(draft, 'B1', 'Paul')
    draft = updatePlayerName(draft, 'B2', 'Marc')
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYERS_PLUS"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={draft}
        microphoneStatus="inactive"
        dictationField={null}
      />,
    )

    const start = html.match(
      /<button class="setup-start-match primary"[^>]*>/,
    )?.[0]
    expect(start).toBeDefined()
    expect(start).not.toContain('disabled')
    expect(html).toContain('Alice et Chloé')
    expect(html).toContain('Paul et Marc')
  })

  it('désactive le démarrage lorsque les commandes sont en conflit', () => {
    const configuration = createDefaultMatchConfiguration()
    configuration.teamB.voiceName = 'Gagné'
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYER"
        configuration={configuration}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        microphoneStatus="inactive"
        dictationField={null}
      />,
    )

    expect(html).toContain('Les commandes de point doivent être différentes.')
    expect(html).toMatch(/setup-start-match[^>]*disabled/)
  })
})
