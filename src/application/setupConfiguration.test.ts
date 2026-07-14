import { describe, expect, it } from 'vitest'
import { createDefaultMatchConfiguration } from './matchConfiguration'
import {
  applyPlayerCommandDictation,
  applyPlayerPlusDictation,
  createPlayerPlusConfigurationDraft,
  getNextMissingSetupField,
  isPlayerConfigurationReady,
  playerConfigurationHasData,
  playerPlusConfigurationToDraft,
  playerPlusConfigurationHasData,
  renamePlayerPlusTeam,
  setupModeHasData,
  swapPlayerSides,
  swapPlayers,
  toPlayerPlusMatchConfiguration,
} from './setupConfiguration'

function validPlayerPlusDraft() {
  const draft = createPlayerPlusConfigurationDraft()
  draft.teamA.displayName = 'Champions'
  draft.teamA.voiceName = 'Rouge'
  draft.teamA.players[0].name = 'Alice'
  draft.teamA.players[1].name = 'Chloé'
  draft.teamB.displayName = 'Invincibles'
  draft.teamB.voiceName = 'Bleu'
  draft.teamB.players[0].name = 'Bob'
  draft.teamB.players[1].name = 'David'
  draft.servingPlayerId = 'A1'
  return draft
}

describe('configuration commune PLAYER / PLAYER+', () => {
  it('conserve PLAYER prêt par défaut sans données personnalisées', () => {
    const configuration = createDefaultMatchConfiguration()
    expect(playerConfigurationHasData(configuration)).toBe(false)
    expect(isPlayerConfigurationReady(configuration)).toBe(true)
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
      'LEFT',
      'RIGHT',
    ])
    expect(configuration.teamB.players.map(({ side }) => side)).toEqual([
      'LEFT',
      'RIGHT',
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
      { id: 'A1', name: '', side: 'LEFT' },
      { id: 'A2', name: 'Alice', side: 'RIGHT' },
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

  it('dicte séparément chaque commande PLAYER après normalisation', () => {
    const configuration = createDefaultMatchConfiguration()
    const teamA = applyPlayerCommandDictation(
      configuration,
      'teamA.voiceName',
      '  Rouge  ',
    )
    const teamB = applyPlayerCommandDictation(
      teamA.configuration,
      'teamB.voiceName',
      'Bleu',
    )

    expect(teamA).toMatchObject({
      accepted: true,
      normalizedTranscript: 'rouge',
      configuration: { teamA: { voiceName: 'Rouge' } },
    })
    expect(teamB).toMatchObject({
      accepted: true,
      configuration: { teamB: { voiceName: 'Bleu' } },
    })
  })

  it('refuse une commande PLAYER en conflit sans modifier le brouillon', () => {
    const configuration = createDefaultMatchConfiguration()
    const result = applyPlayerCommandDictation(
      configuration,
      'teamB.voiceName',
      'gagné',
    )

    expect(result).toMatchObject({
      accepted: false,
      configuration,
      rejectionReason: 'Les consignes vocales doivent être différentes.',
    })
    expect(configuration.teamB.voiceName).toBe('Perdu')
  })

  it('applique une dictée ciblée à une commande PLAYER+ uniquement', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    const result = applyPlayerPlusDictation(
      configuration,
      'teamA.voiceName',
      'Rouge',
    )

    expect(result).toMatchObject({
      accepted: true,
      draft: {
        teamA: { voiceName: 'Rouge' },
        teamB: { voiceName: 'Perdu' },
      },
    })
  })

  it('refuse une commande PLAYER+ en conflit sans effacer la valeur', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    const result = applyPlayerPlusDictation(
      configuration,
      'teamB.voiceName',
      'gagner',
    )

    expect(result.accepted).toBe(false)
    expect(result.draft.teamB.voiceName).toBe('Perdu')
    expect(result.rejectionReason).toBe(
      'Les consignes vocales doivent être différentes.',
    )
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
    expect(getNextMissingSetupField(configuration)).toBe('teamA.player1')
    configuration.teamA.players[0].name = 'Alice'
    expect(getNextMissingSetupField(configuration)).toBe('teamA.player2')
  })

  it('applique une dictée au champ ciblé sans réutiliser l’ancienne étape', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    const renamed = renamePlayerPlusTeam(configuration, 'teamA', 'Champions')
    const result = applyPlayerPlusDictation(renamed, 'teamA.player2', 'Chloé')

    expect(result.accepted).toBe(true)
    expect(result.draft.teamA.players[0].name).toBe('')
    expect(result.draft.teamA.players[1].name).toBe('Chloé')
    expect(result.nextMissingField).toBe('teamA.player1')
  })

  it('alterne clavier puis voix dans un seul brouillon', () => {
    const configuration = createPlayerPlusConfigurationDraft()
    configuration.teamA.displayName = 'Champions'
    configuration.teamA.customDisplayName = true
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

  it('convertit le brouillon valide en configuration canonique', () => {
    const result = toPlayerPlusMatchConfiguration(validPlayerPlusDraft())

    expect(result).toMatchObject({
      ok: true,
      configuration: {
        mode: 'PLAYERS_PLUS',
        firstServer: 'A1',
        teamA: { displayName: 'Champions', voiceName: 'Rouge' },
      },
    })
    if (result.ok) {
      expect(result.configuration.participants.map(({ id }) => id)).toEqual([
        'A1',
        'A2',
        'B1',
        'B2',
      ])
    }
  })

  it('refuse de canoniser un brouillon incomplet', () => {
    const draft = validPlayerPlusDraft()
    draft.teamB.players[1].name = ''
    expect(toPlayerPlusMatchConfiguration(draft)).toMatchObject({ ok: false })
  })

  it('autorise les homonymes et conserve les PlayerId', () => {
    const draft = validPlayerPlusDraft()
    draft.teamA.players[0].name = 'Camille'
    draft.teamA.players[1].name = 'Camille'
    const result = toPlayerPlusMatchConfiguration(draft)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.configuration.participants.slice(0, 2)).toMatchObject([
        { id: 'A1', name: 'Camille' },
        { id: 'A2', name: 'Camille' },
      ])
    }
  })

  it('résout un premier serveur homonyme par son côté', () => {
    const draft = validPlayerPlusDraft()
    draft.teamA.players[0].name = 'Camille'
    draft.teamA.players[1].name = 'Camille'
    draft.servingPlayerId = ''

    const ambiguous = applyPlayerPlusDictation(
      draft,
      'servingPlayerId',
      'Camille',
    )
    expect(ambiguous.accepted).toBe(false)
    expect(ambiguous.ambiguousPlayerIds).toEqual(['A1', 'A2'])

    const resolved = applyPlayerPlusDictation(
      draft,
      'servingPlayerId',
      'gauche',
      ambiguous.ambiguousPlayerIds,
    )
    expect(resolved.accepted).toBe(true)
    expect(resolved.draft.servingPlayerId).toBe('A1')
  })

  it('reconstruit un brouillon PLAYER+ avec les mêmes joueurs', () => {
    const result = toPlayerPlusMatchConfiguration(validPlayerPlusDraft())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const draft = playerPlusConfigurationToDraft(result.configuration)

    expect(draft.teamA.players).toEqual([
      { id: 'A1', name: 'Alice', side: 'LEFT' },
      { id: 'A2', name: 'Chloé', side: 'RIGHT' },
    ])
    expect(draft.servingPlayerId).toBe(result.configuration.firstServer)
  })

  it('échange deux joueurs sans déplacer les emplacements fixes', () => {
    const draft = validPlayerPlusDraft()
    const swapped = swapPlayers(draft, 'A1', 'B2')

    expect(swapped.teamA.players[0]).toMatchObject({
      id: 'A1',
      name: 'David',
      side: 'LEFT',
    })
    expect(swapped.teamB.players[1]).toMatchObject({
      id: 'B2',
      name: 'Alice',
      side: 'RIGHT',
    })
  })
})
