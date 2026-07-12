import { describe, expect, it } from 'vitest'
import { normalizeSpeech, validateTeamNames } from './normalizeSpeech'

describe('normalizeSpeech', () => {
  it('normalise les accents, majuscules, ponctuation et espaces', () => {
    expect(normalizeSpeech('  ÉQUIPE,   Éléphants ! ')).toBe('equipe elephants')
  })

  it('refuse deux noms normalisés identiques', () => {
    expect(validateTeamNames('Équipe Rouge', 'equipe rouge')).toBe(
      'Les noms d’équipe doivent être différents.',
    )
  })

  it('refuse un nom vide', () => {
    expect(validateTeamNames('   ', 'Orques')).toBe(
      'Les deux noms d’équipe sont obligatoires.',
    )
  })

  it('refuse un nom correspondant à une commande réservée', () => {
    expect(validateTeamNames('Corrigé', 'Annule')).toBe(
      'Un nom d’équipe entre en conflit avec une commande réservée.',
    )
  })

  it('refuse un nom correspondant à un alias de commande', () => {
    expect(validateTeamNames('Annuler', 'Orques')).toBe(
      'Un nom d’équipe entre en conflit avec une commande réservée.',
    )
  })

  it('accepte deux noms distincts et non réservés', () => {
    expect(validateTeamNames('Lynx', 'Orques')).toBeNull()
  })
})
