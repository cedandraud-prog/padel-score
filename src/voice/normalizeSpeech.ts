import { resolveVoiceCommand } from './commandAliases'

export function normalizeSpeech(value: string): string {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function validateTeamNames(nameA: string, nameB: string): string | null {
  const normalizedA = normalizeSpeech(nameA)
  const normalizedB = normalizeSpeech(nameB)

  if (!normalizedA || !normalizedB) {
    return 'Les deux noms d’équipe sont obligatoires.'
  }
  if (normalizedA === normalizedB) {
    return 'Les noms d’équipe doivent être différents.'
  }
  if (
    resolveVoiceCommand(normalizedA) !== null ||
    resolveVoiceCommand(normalizedB) !== null
  ) {
    return 'Un nom d’équipe entre en conflit avec une commande réservée.'
  }
  return null
}
