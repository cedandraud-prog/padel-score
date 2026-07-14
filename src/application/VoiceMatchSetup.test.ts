import { describe, expect, it } from 'vitest'
import { VoiceMatchSetup } from './VoiceMatchSetup'
import {
  createDefaultMatchConfiguration,
  validateMatchConfiguration,
  validateVoiceName,
} from './matchConfiguration'

function advanceTeamA(setup: VoiceMatchSetup): void {
  setup.handle('Champions')
  setup.handle('Rouge')
}

function advanceToServer(setup: VoiceMatchSetup): void {
  advanceTeamA(setup)
  setup.handle('Invincibles')
  setup.handle('Bleu')
}

describe('VoiceMatchSetup', () => {
  it('pose la question courte de consigne vocale après le nom affiché A', () => {
    const setup = new VoiceMatchSetup()
    setup.start()

    const result = setup.handle('Champions')

    expect(result.snapshot.configuration.teamA.displayName).toBe('Champions')
    expect(result.snapshot.step).toBe('team-a-voice-name')
    expect(result.announcement).toBe(
      'Quelle consigne vocale pour cette équipe ?',
    )
  })

  it('passe directement de la consigne A au nom de l’équipe B', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')

    const result = setup.handle('Rouge')

    expect(result.snapshot.configuration.teamA.voiceName).toBe('Rouge')
    expect(result.snapshot.step).toBe('team-b-display-name')
    expect(result.announcement).toContain('« Rouge » enregistré.')
    expect(result.announcement).toContain('Nom de la deuxième équipe ?')
    expect(result.announcement).not.toContain('Test de reconnaissance')
  })

  it('passe directement de la consigne B à la question Qui sert', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)
    setup.handle('Les Bleus')

    const result = setup.handle('Bleu')

    expect(result.snapshot.configuration.teamB).toEqual({
      displayName: 'Les Bleus',
      voiceName: 'Bleu',
    })
    expect(result.snapshot.step).toBe('server')
    expect(result.snapshot.prompt).toBe('Qui sert ?')
    expect(result.announcement).toContain('« Bleu » enregistré.')
    expect(result.announcement).toContain('Qui sert ?')
  })

  it('ne conserve aucun état historique de test de reconnaissance', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceTeamA(setup)

    const snapshot = setup.getSnapshot()
    expect(snapshot.step).toBe('team-b-display-name')
    expect(snapshot).not.toHaveProperty('heardTranscript')
    expect(snapshot).not.toHaveProperty('validatedVoiceNames')
    expect(JSON.stringify(snapshot)).not.toContain('validation')
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
    'Serveur',
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
    'refuse « %s » comme consigne vocale',
    (voiceName) => {
      expect(validateVoiceName(voiceName)).toContain('réservée')
    },
  )

  it('refuse une expression vocale de plus de trois mots', () => {
    expect(validateVoiceName('les très grands champions')).toContain(
      'maximum 3 mots',
    )
  })

  it('reconnaît le nom affiché pour choisir le serveur', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceToServer(setup)

    const result = setup.handle('  CHAMPIONS ! ')

    expect(result.snapshot.configuration.servingTeam).toBe('A')
    expect(result.snapshot.step).toBe('confirmation')
  })

  it('reconnaît la consigne vocale pour choisir le serveur', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceToServer(setup)

    const result = setup.handle(' bleu ')

    expect(result.snapshot.configuration.servingTeam).toBe('B')
    expect(result.snapshot.step).toBe('confirmation')
  })

  it('accepte gagner pour la consigne contrôlée gagné', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('gagné')
    setup.handle('Invincibles')
    setup.handle('Bleu')

    const result = setup.handle('gagner')

    expect(result.snapshot.configuration.servingTeam).toBe('A')
    expect(result.snapshot.step).toBe('confirmation')
  })

  it('ne rapproche pas gagner du nom affiché libre Gagné', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Gagné')
    setup.handle('Rouge')
    setup.handle('Invincibles')
    setup.handle('Bleu')

    const result = setup.handle('gagner')

    expect(result.snapshot.step).toBe('server')
    expect(result.snapshot.message).toContain('Dites exactement')
  })

  it('demande une clarification si le serveur est ambigu', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Bleu')
    setup.handle('Rouge')
    setup.handle('Invincibles')
    setup.handle('Bleu')

    const ambiguous = setup.handle('Bleu')

    expect(ambiguous.snapshot.step).toBe('server')
    expect(ambiguous.snapshot.message).toContain('Réponse ambiguë')
    const clarified = setup.handle('Rouge')
    expect(clarified.snapshot.configuration.servingTeam).toBe('A')
    expect(clarified.snapshot.step).toBe('confirmation')
  })

  it('Recommencer revient à la première étape et efface le brouillon', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceToServer(setup)

    const result = setup.handle('Recommencer')

    expect(result.snapshot.step).toBe('team-a-display-name')
    expect(result.snapshot.configuration).toEqual(
      createDefaultMatchConfiguration(),
    )
    expect(result.announcement).toBe(
      'D’accord, recommençons la configuration. Nom de la première équipe ?',
    )
  })

  it('termine le même parcours de démarrage après le choix du serveur', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    advanceToServer(setup)
    setup.handle('Bleu')

    const result = setup.handle('Démarrer')

    expect(result.snapshot.step).toBe('completed')
    expect(result.completedConfiguration).toEqual({
      teamA: { displayName: 'Champions', voiceName: 'Rouge' },
      teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
      servingTeam: 'B',
    })
    expect(
      validateMatchConfiguration(result.completedConfiguration!),
    ).toBeNull()
  })

  it('capitalise automatiquement un nom affiché reconnu vocalement', () => {
    const setup = new VoiceMatchSetup()
    setup.start()

    const result = setup.handle('marie-claire et élise')

    expect(result.snapshot.configuration.teamA.displayName).toBe(
      'Marie-Claire Et Élise',
    )
  })
})
