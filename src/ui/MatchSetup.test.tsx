import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultMatchConfiguration } from '../application/matchConfiguration'
import { createPlayerPlusConfigurationDraft } from '../application/setupConfiguration'
import { VoiceMatchSetup } from '../application/VoiceMatchSetup'
import { MatchSetup } from './MatchSetup'

const callbacks = {
  nextMissingField: null,
  dictationTrace: null,
  showDictationDiagnostics: false,
  onModeChange: () => undefined,
  onConfigurationChange: () => undefined,
  onPlayerPlusConfigurationChange: () => undefined,
  onDictate: () => undefined,
  onEditStateChange: () => undefined,
  onRestartConfiguration: () => undefined,
  onStartPlayerMatch: () => undefined,
  onStartPlayerPlusMatch: () => undefined,
}

describe('MatchSetup', () => {
  it('restaure la hiérarchie guidée de PLAYER sans inputs permanents', () => {
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYER"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        voiceSetup={null}
        microphoneStatus="listening"
        dictationField={null}
      />,
    )

    expect(html.indexOf('« Nouveau match »')).toBeLessThan(
      html.indexOf('Écoute active'),
    )
    expect(html.indexOf('Écoute active')).toBeLessThan(
      html.indexOf('Informations reconnues'),
    )
    expect(html).toContain('En attente…')
    expect(html).toContain('setup-edit-value')
    expect(html).not.toContain('<input value="Équipe A"')
    expect(html).not.toContain('<input value="Équipe B"')
    expect(html).toContain('« Nouveau match »')
  })

  it('affiche la question vocale comme élément dominant', () => {
    const setup = new VoiceMatchSetup()
    const voiceSetup = setup.start().snapshot
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYER"
        configuration={voiceSetup.configuration}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        voiceSetup={voiceSetup}
        microphoneStatus="speaking"
        dictationField={null}
      />,
    )

    expect(html).toContain('class="setup-current-question"')
    expect(html).toContain('<h3>Dites le nom de la première équipe.</h3>')
    expect(html.indexOf('Question en cours')).toBeLessThan(
      html.indexOf('Informations reconnues'),
    )
  })

  it('active le démarrage manuel PLAYER depuis les valeurs du brouillon', () => {
    const configuration = createDefaultMatchConfiguration()
    configuration.teamA = { displayName: 'Champions', voiceName: 'Rouge' }
    configuration.teamB = { displayName: 'Invincibles', voiceName: 'Bleu' }
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYER"
        configuration={configuration}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        voiceSetup={null}
        microphoneStatus="listening"
        dictationField={null}
      />,
    )

    const startButton = html.match(
      /<button class="setup-start-match"[^>]*>Démarrer le match<\/button>/,
    )?.[0]
    expect(startButton).toBeDefined()
    expect(startButton).not.toContain('disabled')
    expect(html).toContain('Champions')
    expect(html).toContain('Rouge')
    expect(html).not.toContain('<input value="Champions"')
  })

  it('restitue immédiatement les réponses vocales et conserve Recommencer', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions du monde')
    const voiceSetup = setup.handle('Rouge').snapshot
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYER"
        configuration={voiceSetup.configuration}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        voiceSetup={voiceSetup}
        microphoneStatus="speaking"
        dictationField={null}
      />,
    )

    expect(html).toContain('Champions Du Monde')
    expect(html).toContain('Rouge')
    expect(html).toContain('Recommencer')
    expect(html).toContain('Annonce en cours')
    expect(html).not.toContain('<input value="Rouge"')
  })

  it('guide PLAYER+ une question à la fois sans formulaire ni moteur', () => {
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYERS_PLUS"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        voiceSetup={null}
        microphoneStatus="inactive"
        dictationField={null}
        nextMissingField="teamA.player1"
      />,
    )

    expect(html).toContain('Quel est le nom du premier joueur de l’équipe 1 ?')
    expect(html.match(/Répondre à la voix/g)).toHaveLength(1)
    expect(html).toContain('Informations reconnues')
    expect(html).toContain('Positions')
    expect(html).toContain('Premier serveur')
    expect(html).toContain('Démarrer le match')
    expect(html).toContain('Le premier serveur est obligatoire.')
    expect(html).not.toMatch(/<input(?! type="radio")/)
    expect(html).not.toContain('Bientôt disponible')
  })

  it('affiche un seul état de réponse vocale PLAYER+', () => {
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYERS_PLUS"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        voiceSetup={null}
        microphoneStatus="listening"
        dictationField="teamA.player1"
        nextMissingField="teamA.player1"
      />,
    )
    expect(html.match(/Parlez maintenant…/g)).toHaveLength(1)
  })

  it('utilise la formulation courte et ne répète l’explication complète qu’une fois', () => {
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYER"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={createPlayerPlusConfigurationDraft()}
        voiceSetup={null}
        microphoneStatus="inactive"
        dictationField={null}
      />,
    )

    expect(html.match(/Mot prononcé pour lui donner un point\./g)).toHaveLength(
      2,
    )
    expect(html.match(/Pendant le match, prononcez/g)).toHaveLength(1)
    expect(html).not.toContain('Pendant le match, dites')
  })

  it('conserve le diagnostic ciblé sans l’exposer par défaut', () => {
    const draft = createPlayerPlusConfigurationDraft()
    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYERS_PLUS"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={draft}
        voiceSetup={null}
        microphoneStatus="inactive"
        dictationField={null}
        showDictationDiagnostics
        dictationTrace={{
          at: 1,
          attemptId: 4,
          targetedField: 'teamB.player2',
          stepBefore: 'teamA.displayName',
          draftBefore: draft,
          rawTranscript: 'David',
          normalizedTranscript: 'david',
          modifiedField: 'teamB.player2',
          rejectionReason: '',
          stepAfter: 'teamA.displayName',
        }}
      />,
    )

    expect(html).toContain('Diagnostic de dictée PLAYER+')
    expect(html).toContain('Cible : teamB.player2')
    expect(html).toContain('Brut : David')
    expect(html).toContain('normalisé : david')
  })

  it('active le démarrage PLAYER+ uniquement avec un brouillon valide', () => {
    const draft = createPlayerPlusConfigurationDraft()
    draft.teamA.displayName = 'Champions'
    draft.teamA.voiceName = 'Rouge'
    draft.teamA.players[0].name = 'Alice'
    draft.teamA.players[1].name = 'Chloé'
    draft.teamB.displayName = 'Copains'
    draft.teamB.voiceName = 'Bleu'
    draft.teamB.players[0].name = 'Paul'
    draft.teamB.players[1].name = 'Marc'
    draft.servingPlayerId = 'A1'

    const html = renderToStaticMarkup(
      <MatchSetup
        {...callbacks}
        message=""
        mode="PLAYERS_PLUS"
        configuration={createDefaultMatchConfiguration()}
        playerPlusConfiguration={draft}
        voiceSetup={null}
        microphoneStatus="inactive"
        dictationField={null}
      />,
    )

    const startButton = html.match(
      /<button class="setup-start-match"[^>]*>Démarrer le match<\/button>/,
    )?.[0]
    expect(startButton).toBeDefined()
    expect(startButton).not.toContain('disabled')
  })
})
