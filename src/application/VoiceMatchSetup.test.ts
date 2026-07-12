import { describe, expect, it } from 'vitest'
import { VoiceMatchSetup, areVoiceNamesValidated } from './VoiceMatchSetup'
import {
  createDefaultMatchConfiguration,
  validateMatchConfiguration,
  validateVoiceName,
} from './matchConfiguration'

function advanceTeamA(setup: VoiceMatchSetup): void {
  setup.handle('Champions')
  setup.handle('Rouge')
  setup.handle('rouge')
}

describe('VoiceMatchSetup', () => {
  it('capture et affiche le nom affiché A', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    const result = setup.handle('Champions')
    expect(result.snapshot.configuration.teamA.displayName).toBe('Champions')
    expect(result.snapshot.step).toBe('team-a-voice-name')
  })

  it('demande directement le nom vocal A', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    expect(setup.handle('Champions').announcement).toBe(
      'Nom vocal de l’équipe Champions ?',
    )
  })

  it('capture et affiche le nom vocal A avant son test', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    const result = setup.handle('Rouge')
    expect(result.snapshot.configuration.teamA.voiceName).toBe('Rouge')
    expect(result.snapshot.step).toBe('team-a-validation')
    expect(result.announcement).toBe(
      'Test de reconnaissance. Dites Rouge après le bip.',
    )
  })

  it('valide exactement le nom vocal A après normalisation', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Les Rouges')
    const result = setup.handle(' les rouges ! ')
    expect(result.snapshot.validatedVoiceNames.A).toBe('Les Rouges')
    expect(result.snapshot.step).toBe('team-b-display-name')
  })

  it('redemande seulement le nom vocal A après un échec', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Rouge')
    const result = setup.handle('Bouge')
    expect(result.snapshot.step).toBe('team-a-voice-name')
    expect(result.snapshot.configuration.teamA.displayName).toBe('Champions')
    expect(result.snapshot.heardTranscript).toBe('Bouge')
    expect(result.announcement).toBe(
      'Rouge est mal reconnu. Donnez un autre nom vocal.',
    )
  })

  it('applique le même parcours à l’équipe B', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Invincibles')
    setup.handle('Bleu')
    const result = setup.handle('bleu')
    expect(result.snapshot.configuration.teamB).toEqual({
      displayName: 'Invincibles',
      voiceName: 'Bleu',
    })
    expect(result.snapshot.validatedVoiceNames.B).toBe('Bleu')
    expect(result.snapshot.step).toBe('server')
  })

  it('refuse deux noms vocaux identiques', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Invincibles')
    const result = setup.handle('ROUGE')
    expect(result.snapshot.step).toBe('team-b-voice-name')
    expect(result.snapshot.message).toContain('différents')
  })

  it.each([
    'Score',
    'Corriger',
    'Nouveau match',
    'Fin de match',
    'Confirmer',
    'Démarrer',
  ])('refuse la commande réservée « %s » comme nom vocal', (voiceName) => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    expect(setup.handle(voiceName).snapshot.message).toContain('réservée')
  })

  it.each(['Annuler', 'Recommencer'])(
    'refuse « %s » comme nom vocal dans le formulaire',
    (voiceName) => {
      expect(validateVoiceName(voiceName)).toContain('réservée')
    },
  )

  it('refuse une expression vocale de plus de trois mots', () => {
    expect(validateVoiceName('les très grands champions')).toContain(
      'maximum 3 mots',
    )
  })

  it('ne demande le serveur qu’après les deux validations', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Invincibles')
    setup.handle('Bleu')
    expect(setup.getSnapshot().step).toBe('team-b-validation')
    expect(setup.handle('Bleu').snapshot.step).toBe('server')
  })

  it('une modification manuelle du nom vocal invalide sa validation', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    const configuration = setup.getSnapshot().configuration
    configuration.teamA.voiceName = 'Tango'
    setup.synchronizeConfiguration(configuration)
    expect(setup.getSnapshot().validatedVoiceNames.A).toBeNull()
  })

  it('vérifie les noms vocaux validés contre le formulaire visible', () => {
    const configuration = {
      teamA: { displayName: 'Champions', voiceName: 'Rouge' },
      teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
      servingTeam: 'A' as const,
    }
    expect(
      areVoiceNamesValidated(configuration, { A: 'Rouge', B: 'Bleu' }),
    ).toBe(true)
    configuration.teamA.voiceName = 'Tango'
    expect(
      areVoiceNamesValidated(configuration, { A: 'Rouge', B: 'Bleu' }),
    ).toBe(false)
  })

  it('valide la configuration complète', () => {
    const configuration = createDefaultMatchConfiguration()
    expect(validateMatchConfiguration(configuration)).toContain('obligatoire')
    configuration.teamA.voiceName = 'Rouge'
    configuration.teamB.voiceName = 'Bleu'
    expect(validateMatchConfiguration(configuration)).toBeNull()
  })
})
