import type { TeamId } from '../core/matchTypes'
import { normalizeSpeech } from '../voice/normalizeSpeech'
import {
  copyMatchConfiguration,
  createDefaultMatchConfiguration,
  type MatchConfiguration,
  validateVoiceIdentifier,
} from './matchConfiguration'

export type VoiceSetupStep =
  | 'idle'
  | 'team-a-name'
  | 'team-a-identifier-choice'
  | 'team-a-custom-identifier'
  | 'team-b-name'
  | 'team-b-identifier-choice'
  | 'team-b-custom-identifier'
  | 'server'
  | 'confirmation'
  | 'completed'
  | 'cancelled'

export interface VoiceMatchSetupSnapshot {
  step: VoiceSetupStep
  prompt: string
  message: string
  configuration: MatchConfiguration
}

export interface VoiceSetupResult {
  snapshot: VoiceMatchSetupSnapshot
  announcement: string
  completedConfiguration?: MatchConfiguration
  cancelled?: boolean
}

const IDENTIFIER_CONTROL_WORDS = new Set([
  'nouvel identifiant',
  'changer',
  'modifier',
  'conserver',
])

function spokenLabel(value: string): string {
  return value.trim().replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '')
}

export class VoiceMatchSetup {
  private step: VoiceSetupStep = 'idle'
  private prompt = ''
  private message = ''
  private configuration = createDefaultMatchConfiguration()

  start(configuration = createDefaultMatchConfiguration()): VoiceSetupResult {
    this.configuration = copyMatchConfiguration(configuration)
    this.step = 'team-a-name'
    this.message = ''
    return this.result(
      'Nom de la première équipe ?',
      'Dites le nom de la première équipe.',
    )
  }

  synchronizeConfiguration(configuration: MatchConfiguration): void {
    this.configuration = copyMatchConfiguration(configuration)
  }

  getSnapshot(): VoiceMatchSetupSnapshot {
    return {
      step: this.step,
      prompt: this.prompt,
      message: this.message,
      configuration: copyMatchConfiguration(this.configuration),
    }
  }

  handle(transcript: string): VoiceSetupResult {
    const normalized = normalizeSpeech(transcript)
    if (normalized === 'annule' || normalized === 'annuler') {
      this.step = 'cancelled'
      return this.result(
        'Configuration annulée.',
        'Configuration annulée.',
        undefined,
        true,
      )
    }
    if (normalized === 'recommencer') return this.start()

    switch (this.step) {
      case 'team-a-name':
        return this.captureName('A', transcript)
      case 'team-a-identifier-choice':
        return this.captureIdentifierChoice('A', normalized)
      case 'team-a-custom-identifier':
        return this.captureCustomIdentifier('A', transcript)
      case 'team-b-name':
        return this.captureName('B', transcript)
      case 'team-b-identifier-choice':
        return this.captureIdentifierChoice('B', normalized)
      case 'team-b-custom-identifier':
        return this.captureCustomIdentifier('B', transcript)
      case 'server':
        return this.captureServer(normalized)
      case 'confirmation':
        if (normalized === 'demarrer') {
          this.step = 'completed'
          return this.result(
            'Match démarré.',
            'Match démarré.',
            copyMatchConfiguration(this.configuration),
          )
        }
        return this.reject('Dites Démarrer, Recommencer ou Annuler.')
      default:
        return this.reject('La configuration vocale n’est pas active.')
    }
  }

  private captureName(team: TeamId, transcript: string): VoiceSetupResult {
    const value = spokenLabel(transcript)
    if (!normalizeSpeech(value)) return this.reject('Le nom est obligatoire.')
    if (
      team === 'B' &&
      normalizeSpeech(value) ===
        normalizeSpeech(this.configuration.teamA.displayName)
    ) {
      return this.reject('Les noms d’équipe doivent être différents.')
    }
    this.message = ''
    const target =
      team === 'A' ? this.configuration.teamA : this.configuration.teamB
    target.displayName = value
    this.step =
      team === 'A' ? 'team-a-identifier-choice' : 'team-b-identifier-choice'
    return this.result(
      `Identifiant vocal proposé : ${target.voiceIdentifier}. Dites Conserver ou Modifier.`,
      'Dites Conserver ou Modifier.',
    )
  }

  private captureIdentifierChoice(
    team: TeamId,
    normalized: string,
  ): VoiceSetupResult {
    if (normalized === 'modifier') {
      this.step =
        team === 'A' ? 'team-a-custom-identifier' : 'team-b-custom-identifier'
      return this.result('', `Dites le nouvel identifiant de l’équipe ${team}.`)
    }
    if (normalized !== 'conserver') {
      return this.reject('Dites Conserver ou Modifier.')
    }
    return this.acceptIdentifier(team)
  }

  private captureCustomIdentifier(
    team: TeamId,
    transcript: string,
  ): VoiceSetupResult {
    const value = spokenLabel(transcript)
    const normalized = normalizeSpeech(value)
    if (IDENTIFIER_CONTROL_WORDS.has(normalized)) {
      return this.reject('Cette expression ne peut pas être un identifiant.')
    }
    const target =
      team === 'A' ? this.configuration.teamA : this.configuration.teamB
    const other =
      team === 'A' ? this.configuration.teamB : this.configuration.teamA
    const error = validateVoiceIdentifier(value, other.voiceIdentifier, [
      other.displayName,
    ])
    if (error) return this.reject(error)
    target.voiceIdentifier = value
    return this.acceptIdentifier(team, `Identifiant vocal ${value}.`)
  }

  private acceptIdentifier(team: TeamId, prefix = ''): VoiceSetupResult {
    this.message = ''
    if (team === 'A') {
      this.step = 'team-b-name'
      return this.result(
        `${prefix} Nom de la deuxième équipe ?`.trim(),
        'Dites le nom de la deuxième équipe.',
      )
    }

    this.step = 'server'
    const { teamA, teamB } = this.configuration
    const summary = `Équipe A : ${teamA.displayName}, commande ${teamA.voiceIdentifier}. Équipe B : ${teamB.displayName}, commande ${teamB.voiceIdentifier}.`
    const question = `Qui sert : ${teamA.voiceIdentifier} ou ${teamB.voiceIdentifier} ?`
    return this.result(`${prefix} ${summary} ${question}`.trim(), question)
  }

  private captureServer(normalized: string): VoiceSetupResult {
    const identifierA = normalizeSpeech(
      this.configuration.teamA.voiceIdentifier,
    )
    const identifierB = normalizeSpeech(
      this.configuration.teamB.voiceIdentifier,
    )
    let servingTeam: TeamId
    if (normalized === identifierA) servingTeam = 'A'
    else if (normalized === identifierB) servingTeam = 'B'
    else
      return this.reject('Dites exactement l’un des deux identifiants vocaux.')

    this.message = ''
    this.configuration.servingTeam = servingTeam
    this.step = 'confirmation'
    const identifier =
      servingTeam === 'A'
        ? this.configuration.teamA.voiceIdentifier
        : this.configuration.teamB.voiceIdentifier
    return this.result(
      `Service ${identifier}. Dites Démarrer ou Recommencer.`,
      'Dites Démarrer ou Recommencer.',
    )
  }

  private reject(reason: string): VoiceSetupResult {
    this.message = reason
    const retry =
      this.step === 'team-a-custom-identifier' ||
      this.step === 'team-b-custom-identifier'
        ? ''
        : this.prompt
    return this.result(`${reason} ${retry}`, this.prompt)
  }

  private result(
    announcement: string,
    prompt: string,
    completedConfiguration?: MatchConfiguration,
    cancelled?: boolean,
  ): VoiceSetupResult {
    this.prompt = prompt
    return {
      snapshot: this.getSnapshot(),
      announcement,
      completedConfiguration,
      cancelled,
    }
  }
}
