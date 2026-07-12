import type { TeamId } from '../core/matchTypes'
import { normalizeSpeech } from '../voice/normalizeSpeech'
import {
  copyMatchConfiguration,
  createDefaultMatchConfiguration,
  type MatchConfiguration,
  validateDisplayName,
  validateVoiceName,
} from './matchConfiguration'

export type VoiceSetupStep =
  | 'idle'
  | 'team-a-display-name'
  | 'team-a-voice-name'
  | 'team-a-validation'
  | 'team-b-display-name'
  | 'team-b-voice-name'
  | 'team-b-validation'
  | 'server'
  | 'confirmation'
  | 'completed'
  | 'cancelled'

export interface VoiceMatchSetupSnapshot {
  step: VoiceSetupStep
  prompt: string
  message: string
  heardTranscript: string
  configuration: MatchConfiguration
  validatedVoiceNames: Record<TeamId, string | null>
}

export interface VoiceSetupResult {
  snapshot: VoiceMatchSetupSnapshot
  announcement: string
  completedConfiguration?: MatchConfiguration
  cancelled?: boolean
}

function spokenLabel(value: string): string {
  return value.trim().replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '')
}

function teamKey(team: TeamId): 'teamA' | 'teamB' {
  return team === 'A' ? 'teamA' : 'teamB'
}

export class VoiceMatchSetup {
  private step: VoiceSetupStep = 'idle'
  private prompt = ''
  private message = ''
  private heardTranscript = ''
  private configuration = createDefaultMatchConfiguration()
  private validatedVoiceNames: Record<TeamId, string | null> = {
    A: null,
    B: null,
  }

  start(configuration = createDefaultMatchConfiguration()): VoiceSetupResult {
    this.configuration = copyMatchConfiguration(configuration)
    this.validatedVoiceNames = { A: null, B: null }
    this.step = 'team-a-display-name'
    this.message = ''
    this.heardTranscript = ''
    return this.result(
      'Nom de la première équipe ?',
      'Dites le nom de la première équipe.',
    )
  }

  synchronizeConfiguration(configuration: MatchConfiguration): void {
    for (const team of ['A', 'B'] as const) {
      const key = teamKey(team)
      if (
        this.validatedVoiceNames[team] &&
        normalizeSpeech(this.validatedVoiceNames[team] ?? '') !==
          normalizeSpeech(configuration[key].voiceName)
      ) {
        this.validatedVoiceNames[team] = null
      }
    }
    this.configuration = copyMatchConfiguration(configuration)
  }

  getSnapshot(): VoiceMatchSetupSnapshot {
    return {
      step: this.step,
      prompt: this.prompt,
      message: this.message,
      heardTranscript: this.heardTranscript,
      configuration: copyMatchConfiguration(this.configuration),
      validatedVoiceNames: { ...this.validatedVoiceNames },
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
    if (normalized === 'recommencer') return this.start(this.configuration)

    switch (this.step) {
      case 'team-a-display-name':
        return this.captureDisplayName('A', transcript)
      case 'team-a-voice-name':
        return this.captureVoiceName('A', transcript)
      case 'team-a-validation':
        return this.validateRecognizedVoiceName('A', transcript)
      case 'team-b-display-name':
        return this.captureDisplayName('B', transcript)
      case 'team-b-voice-name':
        return this.captureVoiceName('B', transcript)
      case 'team-b-validation':
        return this.validateRecognizedVoiceName('B', transcript)
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

  private captureDisplayName(
    team: TeamId,
    transcript: string,
  ): VoiceSetupResult {
    const value = spokenLabel(transcript)
    const error = validateDisplayName(value)
    if (error) return this.reject(error)
    this.configuration[teamKey(team)].displayName = value
    this.message = ''
    this.heardTranscript = ''
    this.step = team === 'A' ? 'team-a-voice-name' : 'team-b-voice-name'
    const question = `Nom vocal de l’équipe ${value} ?`
    return this.result(question, question)
  }

  private captureVoiceName(team: TeamId, transcript: string): VoiceSetupResult {
    const value = spokenLabel(transcript)
    const error = validateVoiceName(value)
    if (error) return this.reject(error)
    const other = team === 'A' ? 'B' : 'A'
    if (
      normalizeSpeech(value) ===
      normalizeSpeech(this.configuration[teamKey(other)].voiceName)
    ) {
      return this.reject('Les noms vocaux doivent être différents.')
    }
    this.configuration[teamKey(team)].voiceName = value
    this.validatedVoiceNames[team] = null
    this.message = ''
    this.heardTranscript = ''
    this.step = team === 'A' ? 'team-a-validation' : 'team-b-validation'
    const instruction = `Test de reconnaissance. Dites ${value} après le bip.`
    return this.result(instruction, instruction)
  }

  private validateRecognizedVoiceName(
    team: TeamId,
    transcript: string,
  ): VoiceSetupResult {
    const candidate = this.configuration[teamKey(team)].voiceName
    this.heardTranscript = transcript.trim()
    if (normalizeSpeech(transcript) !== normalizeSpeech(candidate)) {
      this.validatedVoiceNames[team] = null
      this.step = team === 'A' ? 'team-a-voice-name' : 'team-b-voice-name'
      this.message = `Entendu : « ${this.heardTranscript || 'transcription vide'} ».`
      const failure = `${candidate} est mal reconnu. Donnez un autre nom vocal.`
      return this.result(failure, failure)
    }

    this.validatedVoiceNames[team] = candidate
    this.message = 'Nom vocal validé'
    if (team === 'A') {
      this.step = 'team-b-display-name'
      return this.result(
        'Nom vocal validé. Nom de la deuxième équipe ?',
        'Dites le nom de la deuxième équipe.',
      )
    }
    this.step = 'server'
    return this.result(
      `Nom vocal validé. Qui sert : ${this.configuration.teamA.voiceName} ou ${this.configuration.teamB.voiceName} ?`,
      `Qui sert : ${this.configuration.teamA.voiceName} ou ${this.configuration.teamB.voiceName} ?`,
    )
  }

  private captureServer(normalized: string): VoiceSetupResult {
    let servingTeam: TeamId
    if (normalized === normalizeSpeech(this.configuration.teamA.voiceName))
      servingTeam = 'A'
    else if (normalized === normalizeSpeech(this.configuration.teamB.voiceName))
      servingTeam = 'B'
    else return this.reject('Dites exactement l’un des deux noms vocaux.')
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

export function areVoiceNamesValidated(
  configuration: MatchConfiguration,
  validatedVoiceNames: Record<TeamId, string | null>,
): boolean {
  return (['A', 'B'] as const).every((team) => {
    const validated = validatedVoiceNames[team]
    return (
      validated !== null &&
      normalizeSpeech(validated) ===
        normalizeSpeech(configuration[teamKey(team)].voiceName)
    )
  })
}
