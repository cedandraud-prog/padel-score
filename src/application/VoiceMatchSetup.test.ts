import { describe, expect, it } from 'vitest'
import { validateMatchConfiguration } from './matchConfiguration'
import { VoiceMatchSetup } from './VoiceMatchSetup'

function reachAChoice(setup: VoiceMatchSetup) {
  setup.start()
  return setup.handle('Les Champions')
}

function configureTeams(setup: VoiceMatchSetup) {
  setup.start()
  setup.handle('Les Champions')
  setup.handle('Conserver')
  setup.handle('Les Invincibles')
  return setup.handle('Conserver')
}

function reachConfirmation(setup: VoiceMatchSetup) {
  configureTeams(setup)
  return setup.handle('Bravo')
}

describe('VoiceMatchSetup', () => {
  it('demande le nom affiché de l’équipe A', () => {
    const result = new VoiceMatchSetup().start()
    expect(result.snapshot.step).toBe('team-a-name')
    expect(result.snapshot.prompt).toBe('Dites le nom de la première équipe.')
  })

  it('rend immédiatement visible le nom A capturé', () => {
    const result = reachAChoice(new VoiceMatchSetup())
    expect(result.snapshot.configuration.teamA.displayName).toBe(
      'Les Champions',
    )
  })

  it('Modifier ouvre une étape dédiée sans devenir la valeur', () => {
    const setup = new VoiceMatchSetup()
    reachAChoice(setup)
    const result = setup.handle('Modifier')
    expect(result.snapshot.step).toBe('team-a-custom-identifier')
    expect(result.snapshot.configuration.teamA.voiceIdentifier).toBe('Alpha')
  })

  it('ne prononce aucune nouvelle question après Modifier', () => {
    const setup = new VoiceMatchSetup()
    reachAChoice(setup)
    expect(setup.handle('Modifier').announcement).toBe('')
  })

  it('accepte Tango comme identifiant A et le rend immédiatement visible', () => {
    const setup = new VoiceMatchSetup()
    reachAChoice(setup)
    setup.handle('Modifier')
    const result = setup.handle('Tango')
    expect(result.snapshot.configuration.teamA.voiceIdentifier).toBe('Tango')
    expect(result.snapshot.step).toBe('team-b-name')
    expect(result.announcement).toContain('Identifiant vocal Tango.')
  })

  it.each(['nouvel identifiant', 'changer', 'modifier', 'conserver'])(
    'ne transforme jamais « %s » en identifiant personnalisé',
    (candidate) => {
      const setup = new VoiceMatchSetup()
      reachAChoice(setup)
      setup.handle('Modifier')
      const result = setup.handle(candidate)
      expect(result.snapshot.step).toBe('team-a-custom-identifier')
      expect(result.snapshot.configuration.teamA.voiceIdentifier).toBe('Alpha')
    },
  )

  it('garde l’étape personnalisée et redemande après une valeur invalide', () => {
    const setup = new VoiceMatchSetup()
    reachAChoice(setup)
    setup.handle('Modifier')
    const result = setup.handle('score')
    expect(result.snapshot.step).toBe('team-a-custom-identifier')
    expect(result.announcement).not.toContain('Quel identifiant')
  })

  it('Conserver garde Alpha', () => {
    const setup = new VoiceMatchSetup()
    reachAChoice(setup)
    const result = setup.handle('Conserver')
    expect(result.snapshot.configuration.teamA.voiceIdentifier).toBe('Alpha')
    expect(result.snapshot.step).toBe('team-b-name')
  })

  it('rend immédiatement visible le nom B capturé', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Conserver')
    const result = setup.handle('Invincibles')
    expect(result.snapshot.configuration.teamB.displayName).toBe('Invincibles')
  })

  it('rend immédiatement visible un identifiant B personnalisé', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Conserver')
    setup.handle('Invincibles')
    setup.handle('Modifier')
    const result = setup.handle('Zulu')
    expect(result.snapshot.configuration.teamB.voiceIdentifier).toBe('Zulu')
    expect(result.snapshot.step).toBe('server')
  })

  it('ne demande pas le serveur avant les deux identifiants', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Conserver')
    setup.handle('Invincibles')
    const result = setup.getSnapshot()
    expect(result.step).toBe('team-b-identifier-choice')
    expect(result.prompt).not.toContain('Qui sert')
  })

  it('annonce le récapitulatif avant la question du serveur', () => {
    const result = configureTeams(new VoiceMatchSetup())
    expect(result.announcement.indexOf('Équipe A')).toBeLessThan(
      result.announcement.indexOf('Qui sert'),
    )
  })

  it('utilise les identifiants réellement configurés dans la question serveur', () => {
    const setup = new VoiceMatchSetup()
    setup.start()
    setup.handle('Champions')
    setup.handle('Modifier')
    setup.handle('Tango')
    setup.handle('Invincibles')
    setup.handle('Conserver')
    expect(setup.getSnapshot().prompt).toBe('Qui sert : Tango ou Bravo ?')
  })

  it('sélectionne le serveur par identifiant exact', () => {
    const result = reachConfirmation(new VoiceMatchSetup())
    expect(result.snapshot.configuration.servingTeam).toBe('B')
    expect(result.announcement).toBe(
      'Service Bravo. Dites Démarrer ou Recommencer.',
    )
  })

  it('Recommencer réinitialise formulaire et dialogue', () => {
    const setup = new VoiceMatchSetup()
    reachConfirmation(setup)
    const result = setup.handle('Recommencer')
    expect(result.snapshot.step).toBe('team-a-name')
    expect(result.snapshot.configuration.teamA.displayName).toBe('Équipe A')
    expect(result.snapshot.configuration.teamA.voiceIdentifier).toBe('Alpha')
  })

  it('Annuler quitte avec une configuration cohérente', () => {
    const setup = new VoiceMatchSetup()
    reachAChoice(setup)
    const result = setup.handle('Annuler')
    expect(result.cancelled).toBe(true)
    expect(result.snapshot.configuration.teamA.displayName).toBe(
      'Les Champions',
    )
  })

  it('Démarrer retourne exactement la configuration affichée', () => {
    const setup = new VoiceMatchSetup()
    reachConfirmation(setup)
    const before = setup.getSnapshot().configuration
    const result = setup.handle('Démarrer')
    expect(result.completedConfiguration).toEqual(before)
  })
})

describe('validateMatchConfiguration', () => {
  it('maintient le fonctionnement du formulaire manuel', () => {
    expect(
      validateMatchConfiguration({
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'B',
      }),
    ).toBeNull()
  })
})
