import type { TeamId } from '../core/matchTypes'
import { normalizeSpeech } from '../voice/normalizeSpeech'
import { matchesControlledResponse } from '../voice/controlledResponseAliases'
import {
  copyMatchConfiguration,
  createDefaultMatchConfiguration,
  type PlayerMatchConfiguration,
  validateDisplayName,
  validateVoiceName,
} from './matchConfiguration'
import { formatRecognizedDisplayName } from './formatDisplayName'

export type VoiceSetupStep =
  | 'idle'
  | 'team-a-display-name'
  | 'team-a-voice-name'
  | 'team-b-display-name'
  | 'team-b-voice-name'
  | 'server'
  | 'confirmation'
  | 'completed'
  | 'cancelled'

export type VoiceSetupEditedField =
  | 'teamA.displayName'
  | 'teamA.voiceName'
  | 'teamB.displayName'
  | 'teamB.voiceName'
  | 'servingTeam'

export interface VoiceMatchSetupSnapshot {
  step: VoiceSetupStep
  prompt: string
  message: string
  configuration: PlayerMatchConfiguration
}

export interface VoiceSetupResult {
  snapshot: VoiceMatchSetupSnapshot
  announcement: string
  completedConfiguration?: PlayerMatchConfiguration
  cancelled?: boolean
}

function spokenLabel(value: string): string {
  return value.trim().replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '')
}

function teamKey(team: TeamId): 'teamA' | 'teamB' {
  return team === 'A' ? 'teamA' : 'teamB'
}

function voiceNameQuestion(): string {
  return 'Quelle consigne vocale pour cette équipe ?'
}

function voiceNameConfirmation(voiceName: string): string {
  return `« ${voiceName} » enregistré.`
}

export class VoiceMatchSetup {
  private step: VoiceSetupStep = 'idle'
  private prompt = ''
  private message = ''
  private configuration: PlayerMatchConfiguration =
    createDefaultMatchConfiguration()
  private serverRequiresVoiceName = false

  start(configuration = createDefaultMatchConfiguration()): VoiceSetupResult {
    this.configuration = copyMatchConfiguration(configuration)
    this.serverRequiresVoiceName = false
    this.step = 'team-a-display-name'
    this.message = ''
    return this.result(
      'Nom de la première équipe ?',
      'Dites le nom de la première équipe.',
    )
  }

  synchronizeConfiguration(
    configuration: PlayerMatchConfiguration,
    editedField?: VoiceSetupEditedField,
  ): void {
    this.configuration = copyMatchConfiguration(configuration)
    if (editedField) this.advanceAfterManualEdit(editedField)
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
    if (normalized === 'recommencer') return this.restart()

    switch (this.step) {
      case 'team-a-display-name':
        return this.captureDisplayName('A', transcript)
      case 'team-a-voice-name':
        return this.captureVoiceName('A', transcript)
      case 'team-b-display-name':
        return this.captureDisplayName('B', transcript)
      case 'team-b-voice-name':
        return this.captureVoiceName('B', transcript)
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

  restart(): VoiceSetupResult {
    this.start(createDefaultMatchConfiguration())
    return this.result(
      'D’accord, recommençons la configuration. Nom de la première équipe ?',
      'Dites le nom de la première équipe.',
    )
  }

  private captureDisplayName(
    team: TeamId,
    transcript: string,
  ): VoiceSetupResult {
    const value = formatRecognizedDisplayName(spokenLabel(transcript))
    const error = validateDisplayName(value)
    if (error) return this.reject(error)
    this.configuration[teamKey(team)].displayName = value
    this.message = ''
    this.step = team === 'A' ? 'team-a-voice-name' : 'team-b-voice-name'
    const question = voiceNameQuestion()
    return this.result(question, question)
  }

  private captureVoiceName(team: TeamId, transcript: string): VoiceSetupResult {
    const value = spokenLabel(transcript)
    const error = validateVoiceName(value)
    if (error) return this.reject(error)
    const other = team === 'A' ? 'B' : 'A'
    if (
      matchesControlledResponse(
        value,
        this.configuration[teamKey(other)].voiceName,
      )
    ) {
      return this.reject('Les consignes vocales doivent être différentes.')
    }
    this.configuration[teamKey(team)].voiceName = value
    this.message = ''
    const confirmation = voiceNameConfirmation(value)
    if (team === 'A') {
      this.step = 'team-b-display-name'
      return this.result(
        `${confirmation} Nom de la deuxième équipe ?`,
        'Dites le nom de la deuxième équipe.',
      )
    }
    this.step = 'server'
    return this.result(`${confirmation} Qui sert ?`, 'Qui sert ?')
  }

  private captureServer(normalized: string): VoiceSetupResult {
    const matches = (['A', 'B'] as const).filter((team) => {
      const configuredTeam = this.configuration[teamKey(team)]
      const voiceNameMatches = matchesControlledResponse(
        normalized,
        configuredTeam.voiceName,
      )
      return this.serverRequiresVoiceName
        ? voiceNameMatches
        : normalized === normalizeSpeech(configuredTeam.displayName) ||
            voiceNameMatches
    })

    if (matches.length > 1) {
      this.serverRequiresVoiceName = true
      return this.reject(
        `Réponse ambiguë. Dites la consigne vocale exacte : ${this.configuration.teamA.voiceName} ou ${this.configuration.teamB.voiceName}.`,
      )
    }
    if (matches.length === 0) {
      const expected = this.serverRequiresVoiceName
        ? `Dites exactement ${this.configuration.teamA.voiceName} ou ${this.configuration.teamB.voiceName}.`
        : `Dites exactement ${this.configuration.teamA.displayName}, ${this.configuration.teamA.voiceName}, ${this.configuration.teamB.displayName} ou ${this.configuration.teamB.voiceName}.`
      return this.reject(expected)
    }

    const servingTeam = matches[0]
    this.serverRequiresVoiceName = false
    this.configuration.servingTeam = servingTeam
    this.step = 'confirmation'
    return this.result(
      `Service ${this.configuration[teamKey(servingTeam)].displayName}. Dites Démarrer ou Recommencer.`,
      'Dites Démarrer ou Recommencer.',
    )
  }

  private reject(reason: string): VoiceSetupResult {
    this.message = reason
    return this.result(`${reason} ${this.prompt}`, this.prompt)
  }

  private advanceAfterManualEdit(editedField: VoiceSetupEditedField): void {
    const expectedFieldByStep: Partial<
      Record<VoiceSetupStep, VoiceSetupEditedField>
    > = {
      'team-a-display-name': 'teamA.displayName',
      'team-a-voice-name': 'teamA.voiceName',
      'team-b-display-name': 'teamB.displayName',
      'team-b-voice-name': 'teamB.voiceName',
      server: 'servingTeam',
    }
    if (expectedFieldByStep[this.step] !== editedField) return

    switch (this.step) {
      case 'team-a-display-name':
        this.step = 'team-a-voice-name'
        this.prompt = voiceNameQuestion()
        break
      case 'team-a-voice-name':
        this.step = 'team-b-display-name'
        this.prompt = 'Dites le nom de la deuxième équipe.'
        break
      case 'team-b-display-name':
        this.step = 'team-b-voice-name'
        this.prompt = voiceNameQuestion()
        break
      case 'team-b-voice-name':
        this.step = 'server'
        this.prompt = 'Qui sert ?'
        break
      case 'server':
        this.step = 'confirmation'
        this.prompt = 'Dites Démarrer ou Recommencer.'
        break
    }
    this.message = ''
  }

  private result(
    announcement: string,
    prompt: string,
    completedConfiguration?: PlayerMatchConfiguration,
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
