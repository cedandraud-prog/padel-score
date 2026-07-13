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

  it('demande directement la consigne vocale A', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    expect(setup.handle('Champions').announcement).toBe(
      'Consigne vocale de l’équipe Champions ?',
    )
  })

  it('capture et affiche la consigne vocale A avant son test', () => {
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

  it('redemande seulement la consigne vocale A après un échec', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Rouge')
    const result = setup.handle('Bouge')
    expect(result.snapshot.step).toBe('team-a-voice-name')
    expect(result.snapshot.configuration.teamA.displayName).toBe('Champions')
    expect(result.snapshot.heardTranscript).toBe('Bouge')
    expect(result.announcement).toBe(
      'Rouge est mal reconnu. Donnez une autre consigne vocale.',
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

  it('refuse deux consignes vocales identiques', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Invincibles')
    const result = setup.handle('ROUGE')
    expect(result.snapshot.step).toBe('team-b-voice-name')
    expect(result.snapshot.message).toContain('différentes')
  })

  it.each([
    'Score',
    'Corriger',
    'Nouveau match',
    'Fin de match',
    'Confirmer',
    'Démarrer',
  ])(
    'refuse la commande réservée « %s » comme consigne vocale',
    (voiceName) => {
      const setup = new VoiceMatchSetup()
      setup.start()
      setup.handle('Champions')
      expect(setup.handle(voiceName).snapshot.message).toContain('réservée')
    },
  )

  it.each(['Annuler', 'Recommencer'])(
    'refuse « %s » comme consigne vocale dans le formulaire',
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

  it('une modification manuelle de la consigne vocale invalide sa validation', () => {
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

  it('reconnaît le nom affiché pour choisir le serveur', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Invincibles')
    setup.handle('Bleu')
    setup.handle('Bleu')

    const result = setup.handle('  CHAMPIONS ! ')

    expect(result.snapshot.configuration.servingTeam).toBe('A')
    expect(result.snapshot.step).toBe('confirmation')
  })

  it('reconnaît la consigne vocale pour choisir le serveur', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Invincibles')
    setup.handle('Bleu')
    setup.handle('Bleu')

    const result = setup.handle(' bleu ')

    expect(result.snapshot.configuration.servingTeam).toBe('B')
    expect(result.snapshot.step).toBe('confirmation')
  })

  it('demande une clarification si une réponse serveur désigne les deux équipes', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Bleu')
    setup.handle('Rouge')
    setup.handle('Rouge')
    setup.handle('Invincibles')
    setup.handle('Bleu')
    setup.handle('Bleu')

    const ambiguous = setup.handle('Bleu')
    expect(ambiguous.snapshot.step).toBe('server')
    expect(ambiguous.snapshot.message).toContain('Réponse ambiguë')

    const clarified = setup.handle('Rouge')
    expect(clarified.snapshot.configuration.servingTeam).toBe('A')
    expect(clarified.snapshot.step).toBe('confirmation')
  })

  it('reconnaît Recommencer dès la première étape avec normalisation', () => {
    const setup = new VoiceMatchSetup()
    setup.start()

    const result = setup.handle('  RECOMMENCER !!! ')

    expect(result.snapshot.step).toBe('team-a-display-name')
    expect(result.announcement).toBe(
      'D’accord, recommençons la configuration. Nom de la première équipe ?',
    )
  })

  it('recommence après la saisie d’une équipe et efface le brouillon', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')

    const result = setup.handle('Recommencer')

    expect(result.snapshot.step).toBe('team-a-display-name')
    expect(result.snapshot.configuration).toEqual(
      createDefaultMatchConfiguration(),
    )
    expect(result.snapshot.validatedVoiceNames).toEqual({ A: null, B: null })
  })

  it('recommence après une consigne vocale sans conserver le candidat', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Rouge')

    const result = setup.handle('Recommencer')

    expect(result.snapshot.step).toBe('team-a-display-name')
    expect(result.snapshot.configuration.teamA).toEqual({
      displayName: 'Équipe A',
      voiceName: '',
    })
    expect(result.snapshot.validatedVoiceNames.A).toBeNull()
  })

  it('recommence pendant la question Qui sert', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Invincibles')
    setup.handle('Bleu')
    setup.handle('Bleu')
    expect(setup.getSnapshot().step).toBe('server')

    const result = setup.handle('Recommencer')

    expect(result.snapshot.step).toBe('team-a-display-name')
    expect(result.snapshot.configuration).toEqual(
      createDefaultMatchConfiguration(),
    )
  })

  it('capitalise automatiquement un nom affiché reconnu vocalement', () => {
    const setup = new VoiceMatchSetup()
    setup.start()

    const result = setup.handle('marie-claire et élise')

    expect(result.snapshot.configuration.teamA.displayName).toBe(
      'Marie-Claire Et Élise',
    )
    expect(result.snapshot.step).toBe('team-a-voice-name')
  })
})
