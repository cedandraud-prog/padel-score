import { describe, expect, it } from 'vitest'
import { createDefaultMatchConfiguration } from './matchConfiguration'
import {
  applyPlayerPlusDictation,
  createPlayerPlusConfigurationDraft,
  getNextMissingSetupField,
  isPlayerConfigurationReady,
  playerConfigurationHasData,
  playerPlusConfigurationHasData,
  setupModeHasData,
  swapPlayerSides,
} from './setupConfiguration'

describe('configuration commune PLAYER / PLAYER+', () => {
  it('conserve PLAYER comme mode par défaut sans données utilisateur', () => {
    const configuration = createDefaultMatchConfiguration()
    expect(playerConfigurationHasData(configuration)).toBe(false)
    expect(isPlayerConfigurationReady(configuration)).toBe(false)
  })

  it('active PLAYER lorsque toutes les informations sont valides', () => {
    const configuration = createDefaultMatchConfiguration()
    configuration.teamA = { displayName: 'Champions', voiceName: 'Rouge' }
    configuration.teamB = { displayName: 'Invincibles', voiceName: 'Bleu' }
    expect(isPlayerConfigurationReady(configuration)).toBe(true)
  })

  it('crée PLAYER+ vide avec les côtés attendus', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    expect(configuration.teamA.players.map(({ side }) => side)).toEqual([
      'RIGHT',
      'LEFT',
    ])
    expect(configuration.teamB.players.map(({ side }) => side)).toEqual([
      'RIGHT',
      'LEFT',
    ])
    expect(playerPlusConfigurationHasData(configuration)).toBe(false)
  })

  it('demande une confirmation de bascule uniquement si le mode courant contient des données', () => {
    const player = createDefaultMatchConfiguration()
    const playerPlus = createPlayerPlusConfigurationDraft()
    expect(setupModeHasData('PLAYER', player, playerPlus)).toBe(false)
    player.teamA.voiceName = 'Rouge'
    expect(setupModeHasData('PLAYER', player, playerPlus)).toBe(true)
    playerPlus.teamB.players[1].name = 'Alice'
    expect(setupModeHasData('PLAYERS_PLUS', player, playerPlus)).toBe(true)
  })

  it('inverse les côtés sans modifier les autres informations', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    configuration.teamA.players[0].name = 'Alice'
    const swapped = swapPlayerSides(configuration, 'A')
    expect(swapped.teamA.players).toEqual([
      { id: 'A1', name: 'Alice', side: 'LEFT' },
      { id: 'A2', name: '', side: 'RIGHT' },
    ])
    expect(swapped.teamB).toEqual(configuration.teamB)
  })

  it('alimente le même brouillon PLAYER+ par une transcription', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    const updated = applyPlayerPlusDictation(
      configuration,
      'teamA.player1',
      'Alice',
    )
    expect(updated.accepted).toBe(true)
    expect(updated.draft.teamA.players[0].name).toBe('Alice')
    expect(updated.modifiedField).toBe('teamA.player1')
  })

  it('sélectionne le serveur uniquement par correspondance vocale exacte', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    configuration.teamA.players[0].name = 'Alice'
    expect(
      applyPlayerPlusDictation(configuration, 'servingPlayerId', 'Alice').draft
        .servingPlayerId,
    ).toBe('A1')
    expect(
      applyPlayerPlusDictation(configuration, 'servingPlayerId', 'Bien Alice'),
    ).toMatchObject({
      accepted: false,
      modifiedField: null,
      rejectionReason:
        'Le serveur doit correspondre exactement à un joueur renseigné.',
    })
  })

  it('recalcule la prochaine information après une saisie manuelle', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    expect(getNextMissingSetupField(configuration)).toBe('teamA.displayName')
    configuration.teamA.displayName = 'Champions'
    expect(getNextMissingSetupField(configuration)).toBe('teamA.player1')
    configuration.teamA.players[0].name = 'Alice'
    expect(getNextMissingSetupField(configuration)).toBe('teamA.player2')
  })

  it('applique une dictée au champ ciblé sans réutiliser l’ancienne étape', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    configuration.teamA.displayName = 'Champions'
    const result = applyPlayerPlusDictation(
      configuration,
      'teamA.player2',
      'Chloé',
    )

    expect(result.accepted).toBe(true)
    expect(result.draft.teamA.players[0].name).toBe('')
    expect(result.draft.teamA.players[1].name).toBe('Chloé')
    expect(result.nextMissingField).toBe('teamA.player1')
  })

  it('alterne clavier puis voix dans un seul brouillon', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    configuration.teamA.displayName = 'Champions'
    const result = applyPlayerPlusDictation(
      configuration,
      'teamA.player1',
      'Alice',
    )

    expect(result.draft.teamA.displayName).toBe('Champions')
    expect(result.draft.teamA.players[0].name).toBe('Alice')
    expect(result.nextMissingField).toBe('teamA.player2')
  })

  it('alterne voix puis clavier et avance vers le champ suivant', () => {
    const spoken = applyPlayerPlusDictation(
      createPlayerPlusConfigurationDraft(),
      'teamA.displayName',
      'Champions',
    )
    spoken.draft.teamA.players[0].name = 'Alice'

    expect(getNextMissingSetupField(spoken.draft)).toBe('teamA.player2')
  })

  it('complète entièrement PLAYER+ avec une alternance voix et clavier', () => {
    let configuration = createPlayerPlusConfigurationDraft()
    configuration = applyPlayerPlusDictation(
      configuration,
      'teamA.displayName',
      'Champions',
    ).draft
    configuration.teamA.players[0].name = 'Alice'
    configuration = applyPlayerPlusDictation(
      configuration,
      'teamA.player2',
      'Chloé',
    ).draft
    configuration.teamA.voiceName = 'Rouge'
    configuration = applyPlayerPlusDictation(
      configuration,
      'teamB.displayName',
      'Invincibles',
    ).draft
    configuration.teamB.players[0].name = 'Bob'
    configuration = applyPlayerPlusDictation(
      configuration,
      'teamB.player2',
      'David',
    ).draft
    configuration.teamB.voiceName = 'Bleu'
    configuration = applyPlayerPlusDictation(
      configuration,
      'servingPlayerId',
      'Alice',
    ).draft

    expect(getNextMissingSetupField(configuration)).toBeNull()
  })
})
