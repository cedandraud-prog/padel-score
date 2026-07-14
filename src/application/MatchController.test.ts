import { describe, expect, it, vi } from 'vitest'
import type {
  CommandFeedbackAdapter,
  FeedbackMode,
  RecognitionAdapter,
  RecognitionHandlers,
  ReadinessCueAdapter,
  SynthesisLifecycle,
  SynthesisAdapter,
} from '../voice/speechTypes'
import { ANNOUNCEMENT_VOICE_TEST_PHRASE } from '../voice/speechTypes'
import { announcementSafetyTimeoutMs, MatchController } from './MatchController'
import {
  createDefaultMatchConfiguration,
  type PlayerMatchConfiguration,
} from './matchConfiguration'

function matchConfiguration(
  A: string,
  B: string,
  servingTeam: 'A' | 'B' = 'A',
): PlayerMatchConfiguration {
  return {
    mode: 'PLAYER',
    teamA: { displayName: A, voiceName: A },
    teamB: { displayName: B, voiceName: B },
    servingTeam,
  }
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve()
}

class MockRecognition implements RecognitionAdapter {
  startCount = 0
  stopCount = 0
  disposeCount = 0
  handlers: RecognitionHandlers | null = null
  readonly sessionHandlers: RecognitionHandlers[] = []

  constructor(
    readonly isSupported = true,
    private readonly autoStart = true,
  ) {}

  start(handlers: RecognitionHandlers): void {
    this.startCount += 1
    this.handlers = handlers
    this.sessionHandlers.push(handlers)
    if (this.autoStart) {
      handlers.onStart()
      handlers.onAudioStart?.()
    }
  }

  stop(): void {
    this.stopCount += 1
  }

  dispose(): void {
    this.disposeCount += 1
  }

  endUnexpectedly(): void {
    this.handlers?.onEnd()
  }
}

class MockSynthesis implements SynthesisAdapter {
  readonly isSupported = true
  spoken: string[] = []
  cancelCount = 0

  async speak(text: string): Promise<void> {
    this.spoken.push(text)
  }

  cancel(): void {
    this.cancelCount += 1
  }
}

class DeferredSynthesis extends MockSynthesis {
  private resolveSpeech: (() => void) | null = null

  override speak(text: string): Promise<void> {
    this.spoken.push(text)
    return new Promise((resolve) => {
      this.resolveSpeech = resolve
    })
  }

  finishSpeech(): void {
    this.resolveSpeech?.()
    this.resolveSpeech = null
  }
}

class InterruptibleSynthesis extends MockSynthesis {
  private pendingSpeech: (() => void) | null = null

  override speak(text: string): Promise<void> {
    this.spoken.push(text)
    return new Promise((resolve) => {
      this.pendingSpeech = resolve
    })
  }

  override cancel(): void {
    this.cancelCount += 1
    this.pendingSpeech?.()
    this.pendingSpeech = null
  }

  finishSpeech(): void {
    this.pendingSpeech?.()
    this.pendingSpeech = null
  }
}

class LifecycleSynthesis extends MockSynthesis {
  private lifecycle: SynthesisLifecycle | undefined
  private resolveSpeech: (() => void) | null = null
  private rejectSpeech: ((error: Error) => void) | null = null

  override speak(text: string, lifecycle?: SynthesisLifecycle): Promise<void> {
    this.spoken.push(text)
    this.lifecycle = lifecycle
    lifecycle?.onStarted?.()
    return new Promise((resolve, reject) => {
      this.resolveSpeech = resolve
      this.rejectSpeech = reject
    })
  }

  finishSpeech(): void {
    this.lifecycle?.onEnded?.()
    this.resolveSpeech?.()
    this.clearPending()
  }

  failSpeech(): void {
    this.lifecycle?.onError?.('synthesis-failed')
    this.rejectSpeech?.(new Error('Erreur de synthèse vocale.'))
    this.clearPending()
  }

  override cancel(): void {
    this.cancelCount += 1
    this.lifecycle?.onCancelled?.()
    this.resolveSpeech?.()
  }

  private clearPending(): void {
    this.resolveSpeech = null
    this.rejectSpeech = null
  }
}

class MockFeedback implements CommandFeedbackAdapter {
  plays: Array<Exclude<FeedbackMode, 'NONE'>> = []
  disposeCount = 0

  prepare(): void {}

  async play(mode: Exclude<FeedbackMode, 'NONE'>): Promise<void> {
    this.plays.push(mode)
  }

  dispose(): void {
    this.disposeCount += 1
  }
}

class MockReadinessCue implements ReadinessCueAdapter {
  playCount = 0
  prepared = 0
  disposed = 0

  prepare(): void {
    this.prepared += 1
  }

  async play(): Promise<void> {
    this.playCount += 1
  }

  dispose(): void {
    this.disposed += 1
  }
}

class DeferredReadinessCue extends MockReadinessCue {
  private resolveCue: (() => void) | null = null

  override play(): Promise<void> {
    this.playCount += 1
    return new Promise((resolve) => {
      this.resolveCue = resolve
    })
  }

  finishCue(): void {
    this.resolveCue?.()
    this.resolveCue = null
  }
}

function createController(
  recognition = new MockRecognition(),
  synthesis: SynthesisAdapter = new MockSynthesis(),
) {
  const controller = new MatchController(recognition, synthesis)
  controller.startMatch({
    configuration: matchConfiguration('Lynx', 'Orques'),
  })
  return { controller, recognition, synthesis }
}

function createFeedbackController(
  mode: FeedbackMode = 'BEEP',
  now: () => number = () => 1_000,
  synthesis: SynthesisAdapter = new MockSynthesis(),
) {
  const recognition = new MockRecognition()
  const feedback = new MockFeedback()
  const controller = new MatchController(recognition, synthesis, feedback, now)
  controller.startMatch({
    configuration: matchConfiguration('Alpha', 'Bravo'),
    feedbackMode: mode,
  })
  return { controller, recognition, synthesis, feedback }
}

describe('MatchController', () => {
  it('remplace immédiatement une commande de point pendant le match', async () => {
    const { controller } = createController()

    expect(controller.updateVoiceName('A', 'Rouge')).toBeNull()
    await controller.handleTranscript({ transcript: 'Lynx' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    await controller.handleTranscript({ transcript: 'Rouge' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('refuse une commande de point en conflit avec l’autre équipe', () => {
    const { controller } = createController()

    expect(controller.updateVoiceName('A', 'Orques')).toBe(
      'Les commandes de point doivent être différentes.',
    )
    expect(controller.getSnapshot().configuration?.teamA.voiceName).toBe('Lynx')
  })

  it('termine explicitement la session pour permettre son archivage', async () => {
    const { controller } = createController()

    expect(await controller.finishSession()).toBe(true)
    expect(controller.getSnapshot().session.state).toBe('FINISHED')
    expect(controller.getSnapshot().phase).toBe('session-finished')
  })

  it('reconnaît exactement le nom de l’équipe A', async () => {
    const { controller } = createController()

    await controller.handleTranscript({
      transcript: '  LYNX !',
      confidence: 0.9,
    })

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('reconnaît exactement le nom de l’équipe B', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Orqués', confidence: 0.9 })

    expect(controller.getSnapshot().display.teams.B.points).toBe('15')
  })

  it.each(['gagné', 'gagner'])(
    'reconnaît « %s » pour la consigne contrôlée « gagné »',
    async (transcript) => {
      const configuration = matchConfiguration('Champions', 'Invincibles')
      configuration.teamA.voiceName = 'gagné'
      configuration.teamB.voiceName = 'perdu'
      const controller = new MatchController(
        new MockRecognition(),
        new MockSynthesis(),
      )
      controller.startMatch({ configuration })

      await controller.handleTranscript({ transcript })

      expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    },
  )

  it('ne rapproche pas approximativement un nom affiché libre', async () => {
    const configuration = matchConfiguration('Gagné', 'Invincibles')
    configuration.teamA.voiceName = 'Rouge'
    configuration.teamB.voiceName = 'Bleu'
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({ configuration })

    await controller.handleTranscript({ transcript: 'gagner' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('rejette une commande inconnue sans modifier le score', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Lynx gagne' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('rejette un match avec un nom réservé', () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())

    expect(
      controller.startMatch({
        configuration: matchConfiguration('Score', 'Orques'),
      }),
    ).toBe(false)
    expect(controller.getSnapshot().phase).toBe('setup')
  })

  it('annonce la commande Score sans modifier le moteur', async () => {
    const { controller, synthesis } = createController()
    const before = controller.getSnapshot().display

    await controller.handleTranscript({ transcript: 'Score' })

    expect(controller.getSnapshot().display).toEqual(before)
    expect((synthesis as MockSynthesis).spoken).toHaveLength(1)
    expect((synthesis as MockSynthesis).spoken[0]).toBe('zéro partout')
  })

  it('annonce le score complet sans modifier le moteur', async () => {
    const { controller, synthesis } = createController()
    const before = controller.getSnapshot().display

    await controller.handleTranscript({ transcript: 'Score complet' })

    expect(controller.getSnapshot().display).toEqual(before)
    expect((synthesis as MockSynthesis).spoken[0]).toContain('set')
    expect((synthesis as MockSynthesis).spoken[0]).toContain('jeux')
  })

  it('annule la dernière action avec la commande Annule', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')

    await controller.handleTranscript({ transcript: 'Annule' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('annule la dernière action avec la variante Annuler', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')

    await controller.handleTranscript({ transcript: 'Annuler' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('annule la dernière action avec la variante Annulé', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')

    await controller.handleTranscript({ transcript: 'Annulé' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('annule la dernière action avec la variante Annulez', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')

    await controller.handleTranscript({ transcript: 'Annulez' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('rejette Annulation', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')

    await controller.handleTranscript({ transcript: 'Annulation' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('rejette Peux-tu annuler', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')

    await controller.handleTranscript({ transcript: 'Peux-tu annuler' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('conserve une correspondance exacte pour les noms d’équipes', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Les Lynx' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('entre et sort du mode correction', async () => {
    const { controller } = createController()

    await controller.enterCorrection()
    expect(controller.getSnapshot().phase).toBe('correction')
    controller.cancelCorrection()
    expect(controller.getSnapshot().phase).toBe('match')
  })

  it('n’attribue aucun point pendant le mode correction', async () => {
    const { controller } = createController()
    await controller.enterCorrection()

    await controller.handleTranscript({ transcript: 'Lynx' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().phase).toBe('correction')
    controller.cancelCorrection()
  })

  it('confirme une correction puis reprend le comptage normal', async () => {
    const { controller } = createController()
    await controller.enterCorrection()

    expect(await controller.confirmCorrection(2, 1)).toBe(true)

    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().display.teams.A.points).toBe('30')
    expect(controller.getSnapshot().display.teams.B.points).toBe('15')
  })

  it('le bouton Score utilise l’annonce courte', async () => {
    const { controller, synthesis } = createController()
    await controller.awardPoint('B')
    ;(synthesis as MockSynthesis).spoken.length = 0

    await controller.announcePointScore()

    expect((synthesis as MockSynthesis).spoken).toEqual(['zéro quinze'])
  })

  it('le bouton Score complet utilise l’annonce complète', async () => {
    const { controller, synthesis } = createController()

    await controller.announceFullScore()

    expect((synthesis as MockSynthesis).spoken[0]).toContain('set')
    expect((synthesis as MockSynthesis).spoken[0]).toContain('jeux')
  })

  it('Corrige entre en attente et demande le nouveau score', async () => {
    const { controller, synthesis } = createController()

    await controller.handleTranscript({ transcript: 'Corrige' })

    expect(controller.getSnapshot().phase).toBe('correction')
    expect(controller.getSnapshot().conversationStatus).toBe(
      'En attente du nouveau score',
    )
    expect((synthesis as MockSynthesis).spoken.at(-1)).toBe('Nouveau score ?')
    controller.cancelCorrection()
  })

  it.each(['Corriger', 'Corrigé'])(
    '%s ouvre le parcours guidé',
    async (command) => {
      const { controller } = createController()

      await controller.handleTranscript({ transcript: command })

      expect(controller.getSnapshot().phase).toBe('correction')
      expect(controller.getSnapshot().lastCommand).toBe('START_CORRECTION')
      controller.cancelCorrection()
    },
  )

  it.each([
    ['Corrige 30 30', '30', '30'],
    ['Corrigé, 30, 30', '30', '30'],
    ['Corrige 15 partout', '15', '15'],
    ['Corrige 30 15', '30', '15'],
    ['Corrige égalité', 'Égalité', 'Égalité'],
    ['Corrigez 40 30', '40', '30'],
  ])('applique immédiatement « %s »', async (transcript, pointsA, pointsB) => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript })

    const snapshot = controller.getSnapshot()
    expect(snapshot.display.teams.A.points).toBe(pointsA)
    expect(snapshot.display.teams.B.points).toBe(pointsB)
    expect(snapshot.phase).toBe('match')
    expect(snapshot.lastCommand).toBe('CORRECT_POINTS_INLINE')
    expect(snapshot.correctionResult).toBe('correction appliquée')
  })

  it.each([
    ['Corrige avantage Champion', 'Avantage', '40'],
    ['Corrige avantage Baltringue', '40', 'Avantage'],
  ])(
    'applique « %s » avec les noms réels',
    async (transcript, pointsA, pointsB) => {
      const controller = new MatchController(
        new MockRecognition(),
        new MockSynthesis(),
      )
      controller.startMatch({
        configuration: matchConfiguration('Champion', 'Baltringue'),
      })

      await controller.handleTranscript({ transcript })

      expect(controller.getSnapshot().display.teams.A.points).toBe(pointsA)
      expect(controller.getSnapshot().display.teams.B.points).toBe(pointsB)
    },
  )

  it.each(['Corrige demain', 'Corrige le score', 'Corrige complètement'])(
    'rejette « %s » sans modifier le score',
    async (transcript) => {
      const { controller } = createController()
      const before = controller.getSnapshot().display

      await controller.handleTranscript({ transcript })

      expect(controller.getSnapshot().display).toEqual(before)
      expect(controller.getSnapshot().phase).toBe('match')
      expect(controller.getSnapshot().lastCommand).toBe('CORRECT_POINTS_INLINE')
      expect(controller.getSnapshot().correctionResult).toContain('rejet')
    },
  )

  it('ignore un score sans préfixe en mode normal', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: '30 partout' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('Corrige Champion ne donne pas de point à Champion', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: matchConfiguration('Champion', 'Baltringue'),
    })

    await controller.handleTranscript({ transcript: 'Corrige Champion' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().lastCommand).toBe('CORRECT_POINTS_INLINE')

    await controller.handleTranscript({ transcript: 'Champion' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('préserve jeux, sets et serveur pendant une correction en ligne', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')
    const before = controller.getSnapshot().display

    await controller.handleTranscript({ transcript: 'Corrige 30 15' })

    const after = controller.getSnapshot().display
    expect(after.teams.A.games).toBe(before.teams.A.games)
    expect(after.teams.B.games).toBe(before.teams.B.games)
    expect(after.teams.A.sets).toBe(before.teams.A.sets)
    expect(after.teams.B.sets).toBe(before.teams.B.sets)
    expect(after.teams.A.isServing).toBe(before.teams.A.isServing)
    expect(after.teams.B.isServing).toBe(before.teams.B.isServing)
  })

  it('n’exécute une correction en ligne qu’une seule fois', async () => {
    const synthesis = new MockSynthesis()
    const { controller } = createController(new MockRecognition(), synthesis)

    await controller.handleTranscript({ transcript: 'Corrige 30 30' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('30')
    expect(controller.getSnapshot().display.teams.B.points).toBe('30')
    expect(synthesis.spoken).toEqual(['trente partout'])
  })

  it('diagnostique explicitement une correction en ligne', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Corrigé, 30, 30.' })

    expect(controller.getSnapshot()).toMatchObject({
      normalizedTranscript: 'corrige 30 30',
      lastCommand: 'CORRECT_POINTS_INLINE',
      extractedContent: '30 30',
      interpretation: 'points 2-2',
      correctionResult: 'correction appliquée',
    })
  })

  it.each([
    ['15 partout', '15', '15'],
    ['30, 30', '30', '30'],
    ['30 15', '30', '15'],
    ['quarante partout', 'Égalité', 'Égalité'],
    ['égalité', 'Égalité', 'Égalité'],
    ['avantage équipe A', 'Avantage', '40'],
    ['avantage équipe B', '40', 'Avantage'],
    ['avantage Lynx', 'Avantage', '40'],
  ])(
    'applique la correction vocale « %s »',
    async (transcript, pointsA, pointsB) => {
      const { controller } = createController()
      await controller.enterCorrection()

      await controller.handleTranscript({ transcript })

      const snapshot = controller.getSnapshot()
      expect(snapshot.display.teams.A.points).toBe(pointsA)
      expect(snapshot.display.teams.B.points).toBe(pointsB)
      expect(snapshot.phase).toBe('match')
      expect(snapshot.conversationStatus).toBe('Correction appliquée')
    },
  )

  it('conserve le mode correction après une formulation inconnue', async () => {
    const { controller, synthesis } = createController()
    await controller.enterCorrection()
    const before = controller.getSnapshot().display

    await controller.handleTranscript({ transcript: 'un score bizarre' })

    expect(controller.getSnapshot().display).toEqual(before)
    expect(controller.getSnapshot().phase).toBe('correction')
    expect(controller.getSnapshot().conversationStatus).toBe(
      'Score non compris',
    )
    expect((synthesis as MockSynthesis).spoken.at(-1)).toBe(
      'Score non compris. Répétez ou annulez.',
    )
    controller.cancelCorrection()
  })

  it.each(['Annule', 'Annuler'])(
    '%s quitte la correction sans modifier le score',
    async (command) => {
      const { controller } = createController()
      await controller.awardPoint('A')
      await controller.enterCorrection()

      await controller.handleTranscript({ transcript: command })

      expect(controller.getSnapshot().phase).toBe('match')
      expect(controller.getSnapshot().display.teams.A.points).toBe('15')
      expect(controller.getSnapshot().conversationStatus).toBe(
        'Correction annulée',
      )
    },
  )

  it('un nom d’équipe seul ne marque pas pendant la correction', async () => {
    const { controller } = createController()
    await controller.enterCorrection()

    await controller.handleTranscript({ transcript: 'Lynx' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().phase).toBe('correction')
    controller.cancelCorrection()
  })

  it('reprend l’attribution des points après une correction', async () => {
    const { controller } = createController()
    await controller.enterCorrection()
    await controller.handleTranscript({ transcript: '15 partout' })

    await controller.handleTranscript({ transcript: 'Lynx' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('30')
    expect(controller.getSnapshot().display.teams.B.points).toBe('15')
  })

  it('expire la correction après dix secondes sans modifier le score', async () => {
    vi.useFakeTimers()
    try {
      const { controller, synthesis } = createController()
      await controller.awardPoint('A')
      const before = controller.getSnapshot().display
      await controller.enterCorrection()

      await vi.advanceTimersByTimeAsync(10_000)

      expect(controller.getSnapshot().display).toEqual(before)
      expect(controller.getSnapshot().phase).toBe('match')
      expect(controller.getSnapshot().conversationStatus).toBe(
        'Correction annulée',
      )
      expect((synthesis as MockSynthesis).spoken.at(-1)).toBe(
        'Correction annulée',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('corrige les valeurs numériques d’un tie-break', async () => {
    const { controller } = createController()
    for (let game = 0; game < 6; game += 1) {
      for (let point = 0; point < 4; point += 1)
        await controller.awardPoint('A')
      for (let point = 0; point < 4; point += 1)
        await controller.awardPoint('B')
    }
    await controller.enterCorrection()

    await controller.handleTranscript({ transcript: '8 7' })

    expect(controller.getSnapshot().display.teams.A.points).toBe(8)
    expect(controller.getSnapshot().display.teams.B.points).toBe(7)
  })

  it('préserve jeux, sets et serveur pendant une correction de points', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')
    const before = controller.getSnapshot().display
    await controller.enterCorrection()

    await controller.handleTranscript({ transcript: '30 15' })

    const after = controller.getSnapshot().display
    expect(after.teams.A.games).toBe(before.teams.A.games)
    expect(after.teams.B.games).toBe(before.teams.B.games)
    expect(after.teams.A.sets).toBe(before.teams.A.sets)
    expect(after.teams.B.sets).toBe(before.teams.B.sets)
    expect(after.teams.A.isServing).toBe(before.teams.A.isServing)
    expect(after.teams.B.isServing).toBe(before.teams.B.isServing)
  })

  it('rejette une transcription dont la confiance est trop faible', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Lynx', confidence: 0.4 })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().message).toContain('Confiance insuffisante')
  })

  it('accepte une correspondance exacte lorsque confidence est absente', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Lynx' })

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('traite confidence égale à zéro comme non exploitable', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Lynx', confidence: 0 })

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('applique le seuil lorsque confidence est valide', async () => {
    const { controller } = createController()

    await controller.handleTranscript({ transcript: 'Lynx', confidence: 0.8 })

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('rejette une commande inconnue même avec confidence non exploitable', async () => {
    const { controller } = createController()

    await controller.handleTranscript({
      transcript: 'Lynx gagne',
      confidence: 0,
    })

    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('expose les valeurs brutes de reconnaissance dans le diagnostic', () => {
    const recognition = new MockRecognition()
    const { controller } = createController(recognition)

    recognition.handlers?.onDiagnostic({
      rawTranscript: 'Lynx',
      rawConfidence: 0,
      isFinal: true,
      resultsLength: 2,
      resultIndex: 1,
    })

    expect(controller.getSnapshot().recognitionDiagnostics).toEqual({
      rawTranscript: 'Lynx',
      rawConfidence: 0,
      isFinal: true,
      resultsLength: 2,
      resultIndex: 1,
    })
  })

  it('arrête l’écoute pendant la synthèse puis la reprend', async () => {
    const recognition = new MockRecognition()
    const synthesis = new DeferredSynthesis()
    const { controller } = createController(recognition, synthesis)
    const stopsBeforeAnnouncement = recognition.stopCount

    const pointPromise = controller.awardPoint('A')
    expect(recognition.stopCount).toBe(stopsBeforeAnnouncement + 1)
    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().microphoneStatus).toBe('speaking')

    synthesis.finishSpeech()
    await pointPromise

    expect(recognition.startCount).toBe(2)
    expect(controller.getSnapshot().microphoneStatus).toBe('listening')
  })

  it('ne relance pas l’écoute après un arrêt volontaire', () => {
    const recognition = new MockRecognition()
    const { controller } = createController(recognition)

    controller.disableListening()
    recognition.endUnexpectedly()

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().microphoneStatus).toBe('disabled')
  })

  it('relance l’écoute après un arrêt inattendu', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const { controller } = createController(recognition)

    recognition.endUnexpectedly()
    expect(controller.getSnapshot().microphoneStatus).toBe('starting')
    vi.advanceTimersByTime(250)

    expect(recognition.startCount).toBe(2)
    controller.destroy()
    vi.useRealTimers()
  })

  it('ne termine pas automatiquement la session au vainqueur réglementaire', async () => {
    const recognition = new MockRecognition()
    const synthesis = new MockSynthesis()
    const { controller } = createController(recognition, synthesis)

    for (let game = 0; game < 12; game += 1) {
      for (let point = 0; point < 4; point += 1) {
        await controller.awardPoint('A')
      }
    }

    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().session.state).toBe('IN_PROGRESS')
    expect(controller.getSnapshot().microphoneStatus).toBe('listening')
    expect(synthesis.spoken.at(-1)).toContain('deuxième set Lynx')
    await controller.awardPoint('B')
    expect(controller.getSnapshot().display.teams.B.points).toBe('15')
  })

  it('reste utilisable manuellement sans SpeechRecognition', async () => {
    const recognition = new MockRecognition(false)
    const { controller } = createController(recognition)

    expect(controller.getSnapshot().microphoneStatus).toBe('unavailable')
    await controller.awardPoint('A')
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('joue un feedback avant une commande équipe valide', async () => {
    const { controller, feedback } = createFeedbackController()

    await controller.handleTranscript({ transcript: 'Alpha' })

    expect(feedback.plays).toEqual(['BEEP'])
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('joue un feedback pour la commande Score valide', async () => {
    const { controller, feedback } = createFeedbackController('OK')

    await controller.handleTranscript({ transcript: 'Score' })

    expect(feedback.plays).toEqual(['OK'])
  })

  it('joue un feedback pour Annuler lorsque undo est possible', async () => {
    const { controller, feedback } = createFeedbackController()
    await controller.awardPoint('A')

    await controller.handleTranscript({ transcript: 'Annuler' })

    expect(feedback.plays).toEqual(['BEEP'])
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('ne joue aucun feedback pour une commande inconnue', async () => {
    const { controller, feedback } = createFeedbackController()

    await controller.handleTranscript({ transcript: 'Bonjour' })

    expect(feedback.plays).toEqual([])
  })

  it('ne joue aucun feedback pour une phrase contenant un nom d’équipe', async () => {
    const { controller, feedback } = createFeedbackController()

    await controller.handleTranscript({ transcript: 'Bien joué Alpha' })

    expect(feedback.plays).toEqual([])
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('ne joue aucun feedback pour un résultat intermédiaire', () => {
    const { recognition, feedback } = createFeedbackController()

    recognition.handlers?.onDiagnostic({
      rawTranscript: 'Alpha',
      rawConfidence: 0.9,
      isFinal: false,
      resultsLength: 1,
      resultIndex: 0,
    })

    expect(feedback.plays).toEqual([])
  })

  it('ignore un doublon avec un seul feedback et une seule exécution', async () => {
    let now = 1_000
    const { controller, feedback, synthesis } = createFeedbackController(
      'BEEP',
      () => now,
    )

    await controller.handleTranscript({ transcript: 'Alpha' })
    now += 1_000
    await controller.handleTranscript({ transcript: 'Alpha' })

    expect(feedback.plays).toEqual(['BEEP'])
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    expect(controller.getSnapshot().lastCommand).toBe('Doublon ignoré')
    expect(controller.getSnapshot().message).toBe('Doublon ignoré.')
    expect((synthesis as MockSynthesis).spoken).toHaveLength(1)
  })

  it('réexécute la même commande après plus de 1 500 ms', async () => {
    let now = 1_000
    const { controller, feedback } = createFeedbackController('BEEP', () => now)

    await controller.handleTranscript({ transcript: 'Alpha' })
    now += 1_501
    await controller.handleTranscript({ transcript: 'Alpha' })

    expect(feedback.plays).toEqual(['BEEP', 'BEEP'])
    expect(controller.getSnapshot().display.teams.A.points).toBe('30')
  })

  it('ne mémorise pas une transcription inconnue comme doublon', async () => {
    const { controller, feedback } = createFeedbackController()

    await controller.handleTranscript({ transcript: 'Bonjour' })
    await controller.handleTranscript({ transcript: 'Bonjour' })

    expect(feedback.plays).toEqual([])
    expect(controller.getSnapshot().lastCommand).toBe('Commande inconnue')
  })

  it('ne joue aucun feedback pour une correction invalide', async () => {
    const { controller, feedback } = createFeedbackController()

    await controller.handleTranscript({ transcript: 'Corrige demain' })

    expect(feedback.plays).toEqual([])
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('joue un seul feedback pour une correction valide', async () => {
    const { controller, feedback } = createFeedbackController()

    await controller.handleTranscript({ transcript: 'Corrige 30 30' })

    expect(feedback.plays).toEqual(['BEEP'])
    expect(controller.getSnapshot().display.teams.A.points).toBe('30')
    expect(controller.getSnapshot().display.teams.B.points).toBe('30')
  })

  it('ne joue aucun feedback pour une commande reçue pendant une annonce', async () => {
    const synthesis = new DeferredSynthesis()
    const { controller, feedback } = createFeedbackController(
      'BEEP',
      () => 1_000,
      synthesis,
    )

    const firstCommand = controller.handleTranscript({ transcript: 'Alpha' })
    while (synthesis.spoken.length === 0) await Promise.resolve()
    await controller.handleTranscript({ transcript: 'Bravo' })
    synthesis.finishSpeech()
    await firstCommand

    expect(feedback.plays).toEqual(['BEEP'])
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    expect(controller.getSnapshot().display.teams.B.points).toBe('0')
  })

  it('désactive totalement le feedback en mode NONE', async () => {
    const { controller, feedback } = createFeedbackController('NONE')

    await controller.handleTranscript({ transcript: 'Alpha' })

    expect(feedback.plays).toEqual([])
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })
})

describe('MatchController persistence', () => {
  it('restaure le score, la configuration et undo sans relancer le microphone', async () => {
    const source = createController()
    await source.controller.awardPoint('A')
    await source.controller.awardPoint('B')
    const session = source.controller.createMatchSessionSnapshot({
      id: 'match-stable',
      createdAt: '2026-07-14T10:00:00.000Z',
      startedAt: '2026-07-14T10:01:00.000Z',
    })
    expect(session).not.toBeNull()

    const recognition = new MockRecognition()
    const restored = new MatchController(recognition, new MockSynthesis())
    expect(restored.restoreMatchSession(session!)).toBe(true)

    const snapshot = restored.getSnapshot()
    expect(snapshot.display.teams.A.points).toBe('15')
    expect(snapshot.display.teams.B.points).toBe('15')
    expect(snapshot.configuration?.teamA.displayName).toBe('Lynx')
    expect(snapshot.session.state).toBe('IN_PROGRESS')
    expect(snapshot.experience).toEqual({ stage: 'PLAYING', active: true })
    expect(snapshot.microphoneStatus).toBe('disabled')
    expect(recognition.startCount).toBe(0)

    expect(await restored.undo()).toBe(true)
    expect(restored.getSnapshot().display.teams.B.points).toBe('0')
  })

  it('crée une nouvelle génération vocale seulement après action utilisateur', async () => {
    const source = createController()
    const session = source.controller.createMatchSessionSnapshot({
      id: 'match-stable',
      createdAt: '2026-07-14T10:00:00.000Z',
      startedAt: '2026-07-14T10:01:00.000Z',
    })!
    const recognition = new MockRecognition()
    const restored = new MatchController(recognition, new MockSynthesis())
    restored.restoreMatchSession(session)

    restored.enableListening()

    expect(recognition.startCount).toBe(1)
    expect(restored.getSnapshot().microphoneStatus).toBe('listening')
  })

  it('refuse une sauvegarde dont le mode ne correspond pas au moteur', () => {
    const source = createController()
    const session = source.controller.createMatchSessionSnapshot({
      id: 'match-stable',
      createdAt: '2026-07-14T10:00:00.000Z',
      startedAt: '2026-07-14T10:01:00.000Z',
    })!
    const invalid = {
      ...session,
      mode: 'PLAYERS_PLUS' as const,
      configuration: {
        mode: 'PLAYERS_PLUS' as const,
        teamA: session.configuration.teamA,
        teamB: session.configuration.teamB,
        participants: [],
        firstServer: 'A1' as const,
      },
    }

    const restored = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    expect(restored.restoreMatchSession(invalid)).toBe(false)
    expect(restored.getSnapshot().phase).toBe('setup')
  })
})

describe('MatchController corrections visuelles du MLP', () => {
  it('refuse l’édition du nom affiché pendant la configuration', async () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    await controller.startVoiceSetup()
    const startsBeforeEdit = recognition.startCount

    expect(controller.updateDisplayName('A', 'Les Champions')).toBe(false)

    const snapshot = controller.getSnapshot()
    expect(snapshot.phase).toBe('voice-setup')
    expect(snapshot.editingConfiguration.teamA.displayName).toBe('Équipe 1')
    expect(snapshot.editingConfiguration.teamA.voiceName).toBe('Gagné')
    expect(recognition.startCount).toBe(startsBeforeEdit)
  })

  it('modifie uniquement le nom affiché pendant le match', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceName: 'Rouge' },
        teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
        servingTeam: 'A',
      },
    })

    expect(controller.updateDisplayName('A', 'Les Rouges')).toBe(true)
    await controller.handleTranscript({ transcript: 'Rouge' })

    const snapshot = controller.getSnapshot()
    expect(snapshot.display.teams.A.name).toBe('Les Rouges')
    expect(snapshot.configuration?.teamA.voiceName).toBe('Rouge')
    expect(snapshot.display.teams.A.points).toBe('15')
  })

  it('change le serveur sans modifier le score', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    await controller.awardPoint('A')
    const scoreBeforeChange = controller.getSnapshot().display

    expect(controller.changeServingTeam('B')).toBe(true)

    const changed = controller.getSnapshot().display
    expect(changed.teams.A.points).toBe(scoreBeforeChange.teams.A.points)
    expect(changed.teams.B.points).toBe(scoreBeforeChange.teams.B.points)
    expect(changed.teams.A.games).toBe(scoreBeforeChange.teams.A.games)
    expect(changed.teams.B.games).toBe(scoreBeforeChange.teams.B.games)
    expect(changed.teams.A.isServing).toBe(false)
    expect(changed.teams.B.isServing).toBe(true)

    await controller.awardPoint('A')
    await controller.awardPoint('A')
    await controller.awardPoint('A')
    const nextGame = controller.getSnapshot().display
    expect(nextGame.teams.A.games).toBe(1)
    expect(nextGame.teams.A.isServing).toBe(true)
    expect(nextGame.teams.B.isServing).toBe(false)

    await controller.enterServerCorrection()
    expect(controller.changeServingTeam('B')).toBe(true)
    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().display.teams.B.isServing).toBe(true)
  })

  it('annule la correction du serveur sans annuler le point précédent', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    await controller.awardPoint('A')
    controller.changeServingTeam('B')

    expect(await controller.undo()).toBe(true)
    let display = controller.getSnapshot().display
    expect(display.teams.A.points).toBe('15')
    expect(display.teams.A.isServing).toBe(true)

    expect(await controller.undo()).toBe(true)
    display = controller.getSnapshot().display
    expect(display.teams.A.points).toBe('0')
    expect(display.teams.A.isServing).toBe(true)
  })

  it('conserve le serveur corrigé quand le point suivant est annulé', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    controller.changeServingTeam('B')
    await controller.awardPoint('A')

    expect(await controller.undo()).toBe(true)
    const display = controller.getSnapshot().display
    expect(display.teams.A.points).toBe('0')
    expect(display.teams.B.isServing).toBe(true)
  })

  it('corrige vocalement le serveur avec le nom affiché ou la consigne vocale', async () => {
    const synthesis = new MockSynthesis()
    const controller = new MatchController(new MockRecognition(), synthesis)
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceName: 'Rouge' },
        teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
        servingTeam: 'A',
      },
    })
    await controller.awardPoint('A')
    const scoreBefore = controller.getSnapshot().display

    await controller.handleTranscript({ transcript: 'Serveur' })
    expect(controller.getSnapshot().phase).toBe('server-correction')
    expect(synthesis.spoken).toContain('Quelle équipe sert ?')

    await controller.handleTranscript({ transcript: 'Bleu' })
    const corrected = controller.getSnapshot()
    expect(corrected.phase).toBe('match')
    expect(corrected.display.teams.B.isServing).toBe(true)
    expect(corrected.display.teams.A.points).toBe(scoreBefore.teams.A.points)
    expect(corrected.display.teams.B.points).toBe(scoreBefore.teams.B.points)

    await controller.handleTranscript({ transcript: 'Serveur' })
    await controller.handleTranscript({ transcript: 'Champions' })
    expect(controller.getSnapshot().display.teams.A.isServing).toBe(true)
  })

  it('annonce le futur serveur avec le nom affiché actuel', async () => {
    const synthesis = new MockSynthesis()
    const controller = new MatchController(new MockRecognition(), synthesis)
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceName: 'Rouge' },
        teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
        servingTeam: 'A',
      },
    })
    controller.updateDisplayName('B', 'Les Bleus')
    controller.changeServingTeam('B')

    await controller.announceFullScore()

    expect(synthesis.spoken.at(-1)).toContain('Prochain service : Les Bleus')
  })

  it('suspend et réactive une seule écoute sans quitter l’expérience', () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    const experience = controller.getSnapshot().experience
    const startsBeforeToggle = recognition.startCount

    controller.toggleListening()
    expect(controller.getSnapshot().microphoneStatus).toBe('disabled')
    expect(controller.getSnapshot().experience).toEqual(experience)
    expect(controller.getSnapshot().session.state).toBe('IN_PROGRESS')

    controller.toggleListening()
    expect(recognition.startCount).toBe(startsBeforeToggle + 1)
    expect(controller.getSnapshot().experience).toEqual(experience)

    controller.enableListening()
    expect(recognition.startCount).toBe(startsBeforeToggle + 1)
  })
})

describe('MatchController configuration', () => {
  it('utilise uniquement le nom vocal comme commande de point', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceName: 'Rouge' },
        teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
        servingTeam: 'B',
      },
    })
    await controller.handleTranscript({ transcript: 'Champions' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    await controller.handleTranscript({ transcript: 'Rouge' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    await controller.handleTranscript({ transcript: 'Bleu' })
    expect(controller.getSnapshot().display.teams.B.points).toBe('15')
    expect(controller.getSnapshot().display.teams.B.isServing).toBe(true)
  })

  it('démarre avec une configuration complète sans étape de test vocal', () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    expect(
      controller.startConfiguredMatch({
        configuration: {
          teamA: { displayName: 'Champions', voiceName: 'Rouge' },
          teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
          servingTeam: 'A',
        },
      }),
    ).toBe(true)
    expect(controller.getSnapshot().phase).toBe('match')
  })

  it('redémarre proprement la session vocale entre la configuration manuelle et le match', async () => {
    const recognition = new MockRecognition(true, false)
    const readiness = new MockReadinessCue()
    const controller = new MatchController(
      recognition,
      new MockSynthesis(),
      undefined,
      undefined,
      readiness,
    )
    controller.beginConfigurationExperience()
    controller.listenForNewMatch()
    const setupHandlers = recognition.handlers
    setupHandlers?.onStart()
    setupHandlers?.onAudioStart?.('audiostart')

    const configuration = matchConfiguration('Champions', 'Invincibles')
    configuration.teamA.voiceName = 'Rouge'
    configuration.teamB.voiceName = 'Bleu'
    controller.updateEditingConfiguration(configuration)
    controller.startConfiguredMatch({ configuration })

    expect(recognition.stopCount).toBe(1)
    expect(recognition.startCount).toBe(2)
    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().microphoneStatus).toBe('starting')
    expect(controller.getSnapshot().conversation.state).toBe(
      'STARTING_LISTENING',
    )

    setupHandlers?.onResult({ transcript: 'Rouge' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    expect(controller.getSnapshot().lastCommand).toBe(
      'Résultat d’une ancienne session ignoré',
    )

    const matchHandlers = recognition.handlers
    matchHandlers?.onStart()
    expect(controller.getSnapshot().microphoneStatus).toBe('starting')
    matchHandlers?.onAudioStart?.('audiostart')
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getSnapshot().microphoneStatus).toBe('listening')
    expect(readiness.playCount).toBe(1)
    matchHandlers?.onResult({ transcript: 'Rouge' })
    await flushAsyncWork()

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    expect(controller.getSnapshot().recognitionTiming.decision).toBe('accepted')
    expect(controller.getSnapshot().recognitionTiming.decisionGeneration).toBe(
      2,
    )
  })

  it('mène le parcours vocal direct jusqu’au match', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await controller.startVoiceSetup()
    for (const transcript of [
      'Champions',
      'Rouge',
      'Invincibles',
      'Bleu',
      'Bleu',
      'Démarrer',
    ]) {
      await controller.handleTranscript({ transcript })
    }
    const snapshot = controller.getSnapshot()
    expect(snapshot.phase).toBe('match')
    expect(snapshot.configuration?.teamA).toEqual({
      displayName: 'Champions',
      voiceName: 'Rouge',
    })
    expect(snapshot.display.teams.B.isServing).toBe(true)
  })

  it('Recommencer réinitialise le setup sans quitter l’expérience ni doubler l’écoute', async () => {
    const recognition = new MockRecognition()
    const synthesis = new MockSynthesis()
    const controller = new MatchController(recognition, synthesis)
    await controller.startVoiceSetup()
    await controller.handleTranscript({ transcript: 'Champions' })
    await controller.handleTranscript({ transcript: 'Rouge' })
    const startsBeforeRestart = recognition.startCount

    await controller.handleTranscript({ transcript: 'Recommencer' })

    const snapshot = controller.getSnapshot()
    expect(snapshot.phase).toBe('voice-setup')
    expect(snapshot.voiceSetup?.step).toBe('team-a-display-name')
    expect(snapshot.editingConfiguration).toEqual(
      createDefaultMatchConfiguration(),
    )
    expect(snapshot.experience).toEqual({ stage: 'CONFIGURING', active: true })
    expect(snapshot.session.state).toBe('NOT_STARTED')
    expect(snapshot.continuousListening.shouldListen).toBe(true)
    expect(snapshot.continuousListening.recognitionRunning).toBe(true)
    expect(recognition.startCount).toBe(startsBeforeRestart + 1)
    expect(synthesis.spoken.at(-1)).toBe(
      'D’accord, recommençons la configuration. Nom de la première équipe ?',
    )
  })

  it('le bouton tactile et la commande vocale utilisent le même redémarrage', async () => {
    const voiceController = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    const touchController = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await voiceController.startVoiceSetup()
    await touchController.startVoiceSetup()
    for (const transcript of ['Champions', 'Rouge']) {
      await voiceController.handleTranscript({ transcript })
      await touchController.handleTranscript({ transcript })
    }

    await voiceController.handleTranscript({ transcript: 'Recommencer' })
    await touchController.restartConfiguration()

    expect(touchController.getSnapshot().voiceSetup).toEqual(
      voiceController.getSnapshot().voiceSetup,
    )
    expect(touchController.getSnapshot().editingConfiguration).toEqual(
      voiceController.getSnapshot().editingConfiguration,
    )
    expect(touchController.getSnapshot().experience).toEqual({
      stage: 'CONFIGURING',
      active: true,
    })
  })

  it.each([
    ['première question', []],
    ['saisie de la consigne vocale', ['Champions']],
    ['nom de la deuxième équipe', ['Champions', 'Rouge']],
    ['choix du serveur', ['Champions', 'Rouge', 'Baltringues', 'Bleu']],
  ])('le bouton tactile recommence pendant %s', async (_label, transcripts) => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await controller.startVoiceSetup()
    for (const transcript of transcripts) {
      await controller.handleTranscript({ transcript })
    }

    await controller.restartConfiguration()

    const snapshot = controller.getSnapshot()
    expect(snapshot.phase).toBe('voice-setup')
    expect(snapshot.voiceSetup?.step).toBe('team-a-display-name')
    expect(snapshot.editingConfiguration).toEqual(
      createDefaultMatchConfiguration(),
    )
    expect(snapshot.voiceSetup).not.toHaveProperty('validatedVoiceNames')
    expect(snapshot.voiceSetup).not.toHaveProperty('heardTranscript')
    expect(snapshot.session.state).toBe('NOT_STARTED')
  })

  it('ignore un double clic rapide et ne relance l’écoute qu’une fois', async () => {
    const recognition = new MockRecognition()
    const synthesis = new DeferredSynthesis()
    const controller = new MatchController(recognition, synthesis)
    const initialSetup = controller.startVoiceSetup()
    synthesis.finishSpeech()
    await initialSetup
    const startsBeforeRestart = recognition.startCount

    const firstRestart = controller.restartConfiguration()
    const secondRestart = controller.restartConfiguration()

    expect(secondRestart).toBe(firstRestart)
    expect(
      synthesis.spoken.filter((text) => text.startsWith('D’accord')),
    ).toHaveLength(1)
    synthesis.finishSpeech()
    await Promise.all([firstRestart, secondRestart])
    expect(recognition.startCount).toBe(startsBeforeRestart + 1)
  })

  it('interrompt l’annonce de l’étape en cours avant de recommencer', async () => {
    const recognition = new MockRecognition()
    const synthesis = new InterruptibleSynthesis()
    const controller = new MatchController(recognition, synthesis)
    const initialSetup = controller.startVoiceSetup()

    const restart = controller.restartConfiguration()

    expect(synthesis.cancelCount).toBe(1)
    expect(synthesis.spoken).toEqual([
      'Nom de la première équipe ?',
      'D’accord, recommençons la configuration. Nom de la première équipe ?',
    ])
    synthesis.finishSpeech()
    await Promise.all([initialSetup, restart])
    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().voiceSetup?.step).toBe(
      'team-a-display-name',
    )
  })

  it('ignore une transcription tardive de l’étape précédant le redémarrage', async () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    await controller.startVoiceSetup()
    const staleHandlers = recognition.sessionHandlers.at(-1)

    await controller.restartConfiguration()
    staleHandlers?.onResult({ transcript: 'Ancienne réponse' })
    await Promise.resolve()

    const snapshot = controller.getSnapshot()
    expect(snapshot.voiceSetup?.step).toBe('team-a-display-name')
    expect(snapshot.editingConfiguration).toEqual(
      createDefaultMatchConfiguration(),
    )
    expect(snapshot.lastCommand).toBe('Résultat d’une ancienne session ignoré')
  })

  it('Recommencer ne modifie pas un match déjà lancé', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')
    const before = controller.getSnapshot()

    await controller.handleTranscript({ transcript: 'Recommencer' })

    const after = controller.getSnapshot()
    expect(after.phase).toBe('match')
    expect(after.session).toEqual(before.session)
    expect(after.display).toEqual(before.display)
  })

  it('affiche immédiatement le nom vocal candidat', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await controller.startVoiceSetup()
    await controller.handleTranscript({ transcript: 'Les Baltringues' })
    expect(
      controller.getSnapshot().editingConfiguration.teamA.displayName,
    ).toBe('Les Baltringues')
  })

  it('ignore une transcription d’une ancienne session après une modification manuelle', async () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    await controller.startVoiceSetup()
    const staleHandlers = recognition.handlers
    const edited = controller.getSnapshot().editingConfiguration
    edited.teamA.displayName = 'Valeur manuelle'
    controller.updateEditingConfiguration(edited)

    staleHandlers?.onResult({ transcript: 'Valeur vocale tardive' })
    await Promise.resolve()

    expect(
      controller.getSnapshot().editingConfiguration.teamA.displayName,
    ).toBe('Valeur manuelle')
    expect(controller.getSnapshot().lastCommand).toBe(
      'Résultat d’une ancienne session ignoré',
    )
  })

  it('reprend une seule écoute après validation clavier quand elle était active', async () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    await controller.startVoiceSetup()
    expect(recognition.startCount).toBe(1)

    controller.disableListening()
    const edited = controller.getSnapshot().editingConfiguration
    edited.teamA.displayName = 'Valeur manuelle'
    controller.updateEditingConfiguration(edited, 'teamA.displayName')

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().voiceSetup?.step).toBe('team-a-voice-name')
    expect(controller.getSnapshot().voiceSetup?.prompt).toBe(
      'Quelle consigne vocale pour cette équipe ?',
    )

    controller.enableListening()
    controller.enableListening()

    expect(recognition.startCount).toBe(2)
    expect(controller.getSnapshot().conversation.isRunning).toBe(true)
    expect(controller.getSnapshot().microphoneStatus).toBe('listening')
  })

  it('ne réactive pas une écoute volontairement inactive après une saisie clavier', async () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    await controller.startVoiceSetup()
    controller.disableListening()
    const edited = controller.getSnapshot().editingConfiguration
    edited.teamA.displayName = 'Valeur manuelle'

    controller.updateEditingConfiguration(edited, 'teamA.displayName')

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().conversation.isRunning).toBe(false)
    expect(controller.getSnapshot().microphoneStatus).toBe('disabled')
  })

  it('conserve une modification manuelle du serveur au démarrage', () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    const edited = matchConfiguration('Champions', 'Invincibles')
    edited.servingTeam = 'B'
    controller.updateEditingConfiguration(edited)
    controller.startMatch({
      configuration: controller.getSnapshot().editingConfiguration,
    })
    expect(controller.getSnapshot().display.teams.B.isServing).toBe(true)
  })

  it('Annuler supprime tout état résiduel du dialogue vocal', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await controller.startVoiceSetup()
    await controller.handleTranscript({ transcript: 'Annuler' })
    expect(controller.getSnapshot().phase).toBe('setup')
    expect(controller.getSnapshot().voiceSetup).toBeNull()
  })

  it('joue le bip de disponibilité après la synthèse et la reprise de l’écoute', async () => {
    const recognition = new MockRecognition()
    const synthesis = new DeferredSynthesis()
    const readiness = new MockReadinessCue()
    const controller = new MatchController(
      recognition,
      synthesis,
      undefined,
      undefined,
      readiness,
    )

    const starting = controller.startVoiceSetup()
    expect(readiness.playCount).toBe(0)
    synthesis.finishSpeech()
    await starting

    expect(recognition.startCount).toBeGreaterThan(0)
    expect(readiness.playCount).toBe(1)
  })

  it('ignore toute parole reçue avant la fin du bip de disponibilité', async () => {
    const synthesis = new DeferredSynthesis()
    const readiness = new DeferredReadinessCue()
    const controller = new MatchController(
      new MockRecognition(),
      synthesis,
      undefined,
      undefined,
      readiness,
    )

    const starting = controller.startVoiceSetup()
    synthesis.finishSpeech()
    while (readiness.playCount === 0) await Promise.resolve()
    await controller.handleTranscript({ transcript: 'Trop tôt' })
    expect(
      controller.getSnapshot().editingConfiguration.teamA.displayName,
    ).toBe('Équipe 1')
    readiness.finishCue()
    await starting
    const captured = controller.handleTranscript({ transcript: 'Champions' })
    expect(
      controller.getSnapshot().editingConfiguration.teamA.displayName,
    ).toBe('Champions')
    synthesis.finishSpeech()
    while (readiness.playCount < 2) await Promise.resolve()
    readiness.finishCue()
    await captured
    expect(
      controller.getSnapshot().editingConfiguration.teamA.displayName,
    ).toBe('Champions')
  })

  it('garde le bip de disponibilité indépendant du feedback de commande', async () => {
    const feedback = new MockFeedback()
    const readiness = new MockReadinessCue()
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
      feedback,
      undefined,
      readiness,
    )
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
      feedbackMode: 'BEEP',
    })
    await Promise.resolve()

    await controller.handleTranscript({ transcript: 'Corrige' })

    expect(feedback.plays).toEqual(['BEEP'])
    expect(readiness.playCount).toBe(2)
  })

  it('ne joue aucun bip de disponibilité après une action sans réponse attendue', async () => {
    const readiness = new MockReadinessCue()
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
      undefined,
      undefined,
      readiness,
    )
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    await Promise.resolve()
    const initialReadyBeepCount = readiness.playCount
    await controller.handleTranscript({ transcript: 'Alpha' })
    expect(readiness.playCount).toBe(initialReadyBeepCount)
  })
})

describe('MatchController sortie robuste des annonces', () => {
  it('onend déclenche exactement un démarrage de reconnaissance', async () => {
    const recognition = new MockRecognition(true, false)
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)

    const setup = controller.startVoiceSetup()
    synthesis.finishSpeech()
    await setup

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().voiceTrace.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        'ANNOUNCEMENT_REQUESTED',
        'ANNOUNCEMENT_STARTED',
        'ANNOUNCEMENT_ENDED',
        'RECOGNITION_START_REQUESTED',
      ]),
    )
  })

  it('onerror poursuit le parcours de manière contrôlée', async () => {
    const recognition = new MockRecognition(true, false)
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)

    const setup = controller.startVoiceSetup()
    synthesis.failSpeech()
    await setup

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().voiceTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ANNOUNCEMENT_ERROR' }),
        expect.objectContaining({ type: 'RECOGNITION_START_REQUESTED' }),
      ]),
    )
  })

  it('le timeout de sécurité débloque une annonce sans onend', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition(true, false)
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)

    const setup = controller.startVoiceSetup()
    const timeout = announcementSafetyTimeoutMs(synthesis.spoken[0])
    await vi.advanceTimersByTimeAsync(timeout)
    await setup

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().voiceTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ANNOUNCEMENT_TIMEOUT' }),
        expect.objectContaining({ type: 'RECOGNITION_START_REQUESTED' }),
      ]),
    )
    controller.destroy()
    vi.useRealTimers()
  })

  it('ignore un onend tardif après timeout et ne redémarre pas deux fois', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition(true, false)
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)

    const setup = controller.startVoiceSetup()
    await vi.advanceTimersByTimeAsync(
      announcementSafetyTimeoutMs(synthesis.spoken[0]),
    )
    await setup
    synthesis.finishSpeech()

    expect(recognition.startCount).toBe(1)
    expect(
      controller
        .getSnapshot()
        .voiceTrace.filter(
          ({ type }) => type === 'RECOGNITION_START_REQUESTED',
        ),
    ).toHaveLength(1)
    controller.destroy()
    vi.useRealTimers()
  })

  it('une annulation d’annonce ne bloque pas la reprise', async () => {
    const recognition = new MockRecognition(true, false)
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)

    const setup = controller.startVoiceSetup()
    synthesis.cancel()
    await setup

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().voiceTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ANNOUNCEMENT_CANCELLED' }),
      ]),
    )
  })

  it('deux annonces concurrentes ne créent qu’une session utile', async () => {
    const recognition = new MockRecognition(true, false)
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)

    const initialSetup = controller.startVoiceSetup()
    const restart = controller.restartConfiguration()
    synthesis.finishSpeech()
    await Promise.all([initialSetup, restart])

    expect(recognition.startCount).toBe(1)
  })
})

describe('MatchController test de la voix des annonces', () => {
  it('suspend l’écoute, ignore un résultat pendant la synthèse puis reprend', async () => {
    const recognition = new MockRecognition()
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)
    controller.startMatch({
      configuration: matchConfiguration('Lynx', 'Orques'),
    })
    await flushAsyncWork()
    const listeningHandlers = recognition.handlers
    const initialStarts = recognition.startCount
    const initialStops = recognition.stopCount

    const preview = controller.previewAnnouncementVoice()
    await flushAsyncWork()

    expect(synthesis.spoken.at(-1)).toBe(ANNOUNCEMENT_VOICE_TEST_PHRASE)
    expect(recognition.stopCount).toBeGreaterThan(initialStops)
    expect(controller.getSnapshot().microphoneStatus).toBe('speaking')

    listeningHandlers?.onResult({ transcript: 'Lynx' })
    await flushAsyncWork()
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')

    synthesis.finishSpeech()
    await preview
    await flushAsyncWork()

    expect(recognition.startCount).toBe(initialStarts + 1)
    expect(controller.getSnapshot().conversation.isRunning).toBe(true)
  })

  it('laisse volontairement inactive une écoute qui était inactive', async () => {
    const recognition = new MockRecognition()
    const synthesis = new LifecycleSynthesis()
    const controller = new MatchController(recognition, synthesis)
    controller.startMatch({
      configuration: matchConfiguration('Lynx', 'Orques'),
    })
    await flushAsyncWork()
    controller.disableListening()
    const initialStarts = recognition.startCount

    const preview = controller.previewAnnouncementVoice()
    await flushAsyncWork()
    synthesis.finishSpeech()
    await preview
    await flushAsyncWork()

    expect(recognition.startCount).toBe(initialStarts)
    expect(controller.getSnapshot().conversation.isRunning).toBe(false)
    expect(controller.getSnapshot().microphoneStatus).toBe('disabled')
  })
})

describe('MatchController démarrage réel de la reconnaissance', () => {
  it('reste sans erreur et sans bip avant onstart', () => {
    const recognition = new MockRecognition(true, false)
    const readiness = new MockReadinessCue()
    const controller = new MatchController(
      recognition,
      new MockSynthesis(),
      undefined,
      undefined,
      readiness,
    )
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    const snapshot = controller.getSnapshot()
    expect(snapshot.conversation.state).toBe('STARTING_LISTENING')
    expect(snapshot.microphoneStatus).toBe('starting')
    expect(snapshot.message).not.toContain('Impossible')
    expect(readiness.playCount).toBe(0)
  })

  it('audiostart passe à PLAYER_LISTENING après onstart', async () => {
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    recognition.handlers?.onStart()
    await Promise.resolve()
    expect(controller.getSnapshot().conversation.state).toBe(
      'STARTING_LISTENING',
    )
    recognition.handlers?.onAudioStart?.()
    await Promise.resolve()
    expect(controller.getSnapshot().conversation.state).toBe('PLAYER_LISTENING')
    expect(controller.getSnapshot().message).toBe('À vous de parler')
  })

  it('joue un seul bip sur audiostart et accepte la réponse suivante', async () => {
    const recognition = new MockRecognition(true, false)
    const readiness = new MockReadinessCue()
    const controller = new MatchController(
      recognition,
      new MockSynthesis(),
      undefined,
      undefined,
      readiness,
    )
    await controller.startVoiceSetup()
    const activeHandlers = recognition.handlers

    activeHandlers?.onStart()
    await Promise.resolve()
    expect(readiness.playCount).toBe(0)

    activeHandlers?.onAudioStart?.()
    activeHandlers?.onAudioStart?.()
    await Promise.resolve()
    expect(readiness.playCount).toBe(1)

    activeHandlers?.onResult({ transcript: 'Champions' })
    await Promise.resolve()
    await Promise.resolve()

    expect(
      controller.getSnapshot().editingConfiguration.teamA.displayName,
    ).toBe('Champions')
    const trace = controller.getSnapshot().voiceTrace
    const onStartIndex = trace.findIndex(({ type }) => type === 'ONSTART')
    const audioStartIndex = trace.findIndex(({ type }) => type === 'AUDIOSTART')
    const readyBeepIndex = trace.findIndex(
      ({ soundType }) => soundType === 'READY_BEEP',
    )
    expect(onStartIndex).toBeLessThan(audioStartIndex)
    expect(audioStartIndex).toBeLessThan(readyBeepIndex)
  })

  it('mesure séparément disponibilité, parole et retour du résultat', async () => {
    let clock = 1_000
    const recognition = new MockRecognition(true, false)
    const readiness = new DeferredReadinessCue()
    const controller = new MatchController(
      recognition,
      new MockSynthesis(),
      undefined,
      () => clock,
      readiness,
    )
    controller.startMatch({
      configuration: matchConfiguration('Rouge', 'Bleu'),
    })

    clock = 1_100
    recognition.handlers?.onStart()
    clock = 1_250
    recognition.handlers?.onAudioStart?.('audiostart')
    await Promise.resolve()
    recognition.handlers?.onSpeechStart?.()

    clock = 1_300
    readiness.finishCue()
    await Promise.resolve()
    await Promise.resolve()
    clock = 1_320
    recognition.handlers?.onSpeechStart?.()
    clock = 1_520
    recognition.handlers?.onSpeechEnd?.()
    clock = 4_520
    recognition.handlers?.onResult({ transcript: 'Rouge' })
    await flushAsyncWork()

    expect(controller.getSnapshot().recognitionTiming).toMatchObject({
      generation: 1,
      audioReadinessSource: 'audiostart',
      startRequestedAt: 1_000,
      startToOnStartMs: 100,
      onStartToAudioStartMs: 150,
      beepStartedAt: 1_250,
      beepEndedAt: 1_300,
      beepEndToSpeechStartMs: 20,
      speechDurationMs: 200,
      speechEndToResultMs: 3_000,
      beepEndToResultMs: 3_220,
      decision: 'accepted',
      decisionGeneration: 1,
    })
  })

  it('accepte un résultat tardif de la génération active', async () => {
    let clock = 0
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(
      recognition,
      new MockSynthesis(),
      undefined,
      () => clock,
    )
    controller.startMatch({
      configuration: matchConfiguration('Rouge', 'Bleu'),
    })
    recognition.handlers?.onStart()
    recognition.handlers?.onAudioStart?.('audiostart')
    clock = 10_000
    recognition.handlers?.onResult({ transcript: 'Rouge' })
    await flushAsyncWork()

    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    expect(controller.getSnapshot().recognitionTiming.decision).toBe('accepted')
  })

  it('ne relance pas un démarrage déjà en cours', () => {
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    controller.enableListening()
    expect(recognition.startCount).toBe(1)
  })

  it('ignore le onstart tardif d’une ancienne tentative', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    const oldHandlers = recognition.handlers
    vi.advanceTimersByTime(1_500)
    oldHandlers?.onStart()
    await Promise.resolve()
    expect(controller.getSnapshot().recognitionLifecycle).toContain(
      'onstart obsolète ignoré',
    )
    controller.destroy()
    vi.useRealTimers()
  })

  it('affiche l’échec après plusieurs timeouts sans onstart', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    vi.advanceTimersByTime(6_100)
    expect(controller.getSnapshot().message).toBe(
      'Impossible de démarrer la reconnaissance vocale.',
    )
    controller.destroy()
    vi.useRealTimers()
  })

  it('onstart avant le timeout annule tout faux échec', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    recognition.handlers?.onStart()
    await Promise.resolve()
    recognition.handlers?.onAudioStart?.()
    await Promise.resolve()
    vi.advanceTimersByTime(3_000)
    expect(controller.getSnapshot().message).toBe('À vous de parler')
    expect(controller.getSnapshot().microphoneStatus).toBe('listening')
    controller.destroy()
    vi.useRealTimers()
  })

  it('affiche l’échec uniquement après une erreur réelle', () => {
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    recognition.handlers?.onError(
      'unknown',
      'Impossible de démarrer la reconnaissance vocale.',
    )
    expect(controller.getSnapshot().message).toBe(
      'Impossible de démarrer la reconnaissance vocale.',
    )
    expect(controller.getSnapshot().conversation.state).toBe('ERROR')
  })
})

describe('MatchController écoute fonctionnellement continue', () => {
  it('expose et change la stratégie d’écoute', () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })

    controller.setListeningStrategy('LEGACY')

    expect(controller.getSnapshot().listeningStrategy).toBe('LEGACY')
    expect(recognition.startCount).toBe(2)
  })

  it('LEGACY reproduit la relance historique immédiate sans son applicatif', () => {
    const recognition = new MockRecognition()
    const readiness = new MockReadinessCue()
    const feedback = new MockFeedback()
    const controller = new MatchController(
      recognition,
      new MockSynthesis(),
      feedback,
      undefined,
      readiness,
      'LEGACY',
    )
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    const initialReadyBeepCount = readiness.playCount
    controller.resetVoiceMetrics()

    recognition.endUnexpectedly()

    expect(recognition.startCount).toBe(2)
    expect(controller.getSnapshot().voiceTrace).toEqual([
      expect.objectContaining({ type: 'ONEND', attemptId: 1 }),
      expect.objectContaining({
        type: 'RESTART_REQUESTED',
        origin: 'LEGACY_ONEND',
      }),
      expect.objectContaining({
        type: 'START_CALLED',
        origin: 'LEGACY_ONEND',
        attemptId: 2,
      }),
      expect.objectContaining({
        type: 'RECOGNITION_START_REQUESTED',
        origin: 'LEGACY_ONEND',
        attemptId: 2,
      }),
      expect.objectContaining({ type: 'ONSTART', attemptId: 2 }),
      expect.objectContaining({ type: 'AUDIOSTART', attemptId: 2 }),
    ])
    expect(
      controller
        .getSnapshot()
        .voiceTrace.some(({ type }) => type === 'APPLICATION_SOUND'),
    ).toBe(false)
    expect(readiness.playCount).toBe(initialReadyBeepCount)
    expect(feedback.plays).toEqual([])
  })

  it('reste visuellement en écoute entre deux sessions techniques', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })

    recognition.endUnexpectedly()

    expect(controller.getSnapshot().microphoneStatus).toBe('starting')
    expect(controller.getSnapshot().conversation.state).toBe('PLAYER_LISTENING')
    expect(controller.getSnapshot().continuousListening.restartPending).toBe(
      true,
    )
    vi.advanceTimersByTime(250)
    expect(recognition.startCount).toBe(2)
    controller.destroy()
    vi.useRealTimers()
  })

  it('ne joue aucun son applicatif lors d’une relance purement technique', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const readiness = new MockReadinessCue()
    const feedback = new MockFeedback()
    const controller = new MatchController(
      recognition,
      new MockSynthesis(),
      feedback,
      undefined,
      readiness,
    )
    await controller.startVoiceSetup()
    expect(readiness.playCount).toBe(1)
    controller.resetVoiceMetrics()

    recognition.endUnexpectedly()
    vi.advanceTimersByTime(250)
    await Promise.resolve()

    expect(recognition.startCount).toBe(2)
    expect(readiness.playCount).toBe(1)
    expect(feedback.plays).toEqual([])
    expect(controller.getSnapshot().voiceTrace).toEqual([
      expect.objectContaining({ type: 'ONEND', attemptId: 1 }),
      expect.objectContaining({
        type: 'RESTART_REQUESTED',
        origin: 'CONTINUOUS_ONEND',
      }),
      expect.objectContaining({
        type: 'START_CALLED',
        origin: 'CONTINUOUS_RESTART_TIMER',
        attemptId: 2,
      }),
      expect.objectContaining({
        type: 'RECOGNITION_START_REQUESTED',
        origin: 'CONTINUOUS_RESTART_TIMER',
        attemptId: 2,
      }),
      expect.objectContaining({ type: 'ONSTART', attemptId: 2 }),
      expect.objectContaining({ type: 'AUDIOSTART', attemptId: 2 }),
    ])
    controller.destroy()
    vi.useRealTimers()
  })

  it('CONTINUOUS ignore un second onend et ne multiplie pas les start', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    controller.resetVoiceMetrics()
    const endedSession = recognition.handlers

    endedSession?.onEnd()
    endedSession?.onEnd()
    vi.advanceTimersByTime(250)

    expect(recognition.startCount).toBe(2)
    expect(
      controller
        .getSnapshot()
        .voiceTrace.filter(({ type }) => type === 'RESTART_REQUESTED'),
    ).toHaveLength(1)
    expect(
      controller
        .getSnapshot()
        .voiceTrace.filter(({ type }) => type === 'START_CALLED'),
    ).toHaveLength(1)
    controller.destroy()
    vi.useRealTimers()
  })

  it('récupère discrètement après no-speech', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    const session = recognition.handlers

    session?.onError('no-speech', 'Aucune parole détectée.')
    session?.onEnd()
    expect(controller.getSnapshot().microphoneStatus).toBe('starting')
    vi.advanceTimersByTime(500)

    expect(recognition.startCount).toBe(2)
    expect(controller.getSnapshot().message).not.toContain('Aucune parole')
    controller.destroy()
    vi.useRealTimers()
  })

  it('arrête les relances lorsque la permission microphone est refusée', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    const session = recognition.handlers

    session?.onError(
      'not-allowed',
      'Permission microphone refusée. Autorisez le microphone dans Chrome.',
    )
    session?.onEnd()
    vi.runAllTimers()

    expect(recognition.startCount).toBe(1)
    expect(controller.getSnapshot().microphoneStatus).toBe('error')
    expect(controller.getSnapshot().continuousListening.shouldListen).toBe(
      false,
    )
    controller.destroy()
    vi.useRealTimers()
  })

  it('arrête les relances après trois erreurs réseau consécutives', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })

    let session = recognition.handlers
    session?.onError('network', 'Erreur réseau.')
    session?.onEnd()
    vi.advanceTimersByTime(500)
    session = recognition.handlers
    session?.onError('network', 'Erreur réseau.')
    session?.onEnd()
    vi.advanceTimersByTime(1_000)
    session = recognition.handlers
    session?.onError('network', 'Erreur réseau persistante.')
    session?.onEnd()
    vi.runAllTimers()

    expect(recognition.startCount).toBe(3)
    expect(controller.getSnapshot().microphoneStatus).toBe('error')
    expect(controller.getSnapshot().message).toBe('Erreur réseau persistante.')
    controller.destroy()
    vi.useRealTimers()
  })

  it('conserve le contexte de configuration pendant une relance', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    await controller.startVoiceSetup()
    await controller.handleTranscript({ transcript: 'Champions' })
    const before = controller.getSnapshot()

    recognition.endUnexpectedly()
    vi.advanceTimersByTime(250)

    const after = controller.getSnapshot()
    expect(after.editingConfiguration.teamA.displayName).toBe('Champions')
    expect(after.voiceSetup?.step).toBe(before.voiceSetup?.step)
    controller.destroy()
    vi.useRealTimers()
  })

  it('conserve le score courant pendant une relance', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    await controller.awardPoint('A')
    const before = controller.getSnapshot().display

    recognition.endUnexpectedly()
    vi.advanceTimersByTime(250)

    expect(controller.getSnapshot().display).toEqual(before)
    controller.destroy()
    vi.useRealTimers()
  })
})

describe('MatchController expérience active', () => {
  it('active l’expérience dès la configuration', () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.beginConfigurationExperience()
    expect(controller.getSnapshot().experience).toEqual({
      stage: 'CONFIGURING',
      active: true,
    })
    expect(recognition.startCount).toBe(0)
  })

  it('reste active entre configuration et match', () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.beginConfigurationExperience()
    controller.startMatch({
      configuration: matchConfiguration('Champions', 'Invincibles'),
    })
    expect(controller.getSnapshot().experience).toEqual({
      stage: 'PLAYING',
      active: true,
    })
  })

  it('termine l’expérience avec la session de jeu', async () => {
    const { controller } = createController()
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Confirmer' })
    expect(controller.getSnapshot().experience).toEqual({
      stage: 'FINISHED',
      active: false,
    })
  })

  it('désactive l’expérience au retour à l’accueil', () => {
    const { controller } = createController()
    controller.prepareNewMatch()
    expect(controller.getSnapshot().experience).toEqual({
      stage: 'IDLE',
      active: false,
    })
  })
})

describe('MatchController session de jeu', () => {
  it('démarre la session avec le match', () => {
    const { controller } = createController()
    expect(controller.getSnapshot().session.state).toBe('IN_PROGRESS')
  })

  it('demande une confirmation pour Fin de match', async () => {
    const { controller, synthesis } = createController()
    await controller.handleTranscript({ transcript: 'Fin de match' })
    expect(controller.getSnapshot().phase).toBe('session-end-confirmation')
    expect(controller.getSnapshot().session.isFinishConfirmationPending).toBe(
      true,
    )
    expect((synthesis as MockSynthesis).spoken).toContain(
      'Confirmer la fin du match ? Oui ou non ?',
    )
  })

  it('Non reprend la session sans changer le score', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')
    const before = controller.getSnapshot().display
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Non' })
    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().session.state).toBe('IN_PROGRESS')
    expect(controller.getSnapshot().display).toEqual(before)
  })

  it('Oui termine la session et conserve exactement le score', async () => {
    const { controller, synthesis } = createController()
    await controller.awardPoint('A')
    await controller.awardPoint('B')
    const before = controller.getSnapshot().display
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Oui' })
    const snapshot = controller.getSnapshot()
    expect(snapshot.session.state).toBe('FINISHED')
    expect(snapshot.phase).toBe('session-finished')
    expect(snapshot.display).toEqual(before)
    expect((synthesis as MockSynthesis).spoken.at(-1)).toContain(
      'Fin du match.',
    )
  })

  it('conserve Confirmer comme synonyme de Oui', async () => {
    const { controller } = createController()
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Confirmer' })
    expect(controller.getSnapshot().session.state).toBe('FINISHED')
  })

  it('conserve Annuler comme synonyme de Non', async () => {
    const { controller } = createController()
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Annuler' })
    expect(controller.getSnapshot().session.state).toBe('IN_PROGRESS')
    expect(controller.getSnapshot().phase).toBe('match')
  })

  it('n’interprète pas une commande sportive comme Oui ou Non', async () => {
    const { controller } = createController()
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Score' })
    const snapshot = controller.getSnapshot()
    expect(snapshot.session.state).toBe('IN_PROGRESS')
    expect(snapshot.phase).toBe('session-end-confirmation')
    expect(snapshot.message).toBe('Dites Oui ou Non.')
  })

  it('refuse Nouveau match pendant une session en cours', async () => {
    const { controller } = createController()
    await controller.handleTranscript({ transcript: 'Nouveau match' })
    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().message).toBe("Le match n'est pas terminé.")
  })

  it('Nouveau match après la fin réinitialise puis lance la configuration vocale', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Confirmer' })
    await controller.handleTranscript({ transcript: 'Nouveau match' })
    const snapshot = controller.getSnapshot()
    expect(snapshot.phase).toBe('voice-setup')
    expect(snapshot.session.state).toBe('NOT_STARTED')
    expect(snapshot.display.teams.A.points).toBe('0')
    expect(snapshot.display.teams.A.games).toBe(0)
    expect(snapshot.display.teams.A.sets).toBe(0)
  })

  it('ignore les commandes de score après la fin de session', async () => {
    const { controller } = createController()
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Confirmer' })
    await controller.handleTranscript({ transcript: 'Lynx' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('Nouveau match depuis NOT_STARTED lance directement VoiceMatchSetup', async () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.listenForNewMatch()
    expect(recognition.startCount).toBe(1)
    await controller.handleTranscript({ transcript: 'Nouveau match' })
    expect(controller.getSnapshot().phase).toBe('voice-setup')
    expect(controller.getSnapshot().voiceSetup?.step).toBe(
      'team-a-display-name',
    )
  })

  it('ignore silencieusement toute autre parole depuis NOT_STARTED', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.listenForNewMatch()
    const before = controller.getSnapshot()
    await controller.handleTranscript({ transcript: 'Bonjour tout le monde' })
    const after = controller.getSnapshot()
    expect(after.phase).toBe('setup')
    expect(after.message).toBe(before.message)
    expect(after.voiceSetup).toBeNull()
  })

  it('n’exécute pas un résultat intermédiaire sur l’écran d’attente', () => {
    const recognition = new MockRecognition()
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.listenForNewMatch()
    recognition.handlers?.onDiagnostic({
      rawTranscript: 'Nouveau match',
      rawConfidence: 0.9,
      isFinal: false,
      resultsLength: 1,
      resultIndex: 0,
    })
    expect(controller.getSnapshot().phase).toBe('setup')
    expect(controller.getSnapshot().voiceSetup).toBeNull()
  })

  it('ne lance qu’une seule configuration vocale', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.listenForNewMatch()
    await controller.handleTranscript({ transcript: 'Nouveau match' })
    const firstSnapshot = controller.getSnapshot().voiceSetup
    await controller.handleTranscript({ transcript: 'Nouveau match' })
    expect(controller.getSnapshot().voiceSetup).toEqual(firstSnapshot)
  })

  it('ne démarre pas plusieurs reconnaissances concurrentes en attente', () => {
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.listenForNewMatch()
    controller.listenForNewMatch()
    expect(recognition.startCount).toBe(1)
  })

  it('annonce le premier prompt puis attend audiostart avant le bip', async () => {
    const recognition = new MockRecognition(true, false)
    const synthesis = new MockSynthesis()
    const readiness = new MockReadinessCue()
    const controller = new MatchController(
      recognition,
      synthesis,
      undefined,
      undefined,
      readiness,
    )
    controller.listenForNewMatch()
    recognition.handlers?.onStart()
    await Promise.resolve()
    await controller.handleTranscript({ transcript: 'Nouveau match' })
    expect(synthesis.spoken).toContain('Nom de la première équipe ?')
    expect(readiness.playCount).toBe(0)
    recognition.handlers?.onStart()
    await Promise.resolve()
    expect(readiness.playCount).toBe(0)
    recognition.handlers?.onAudioStart?.()
    await Promise.resolve()
    expect(readiness.playCount).toBe(1)
  })

  it('le bouton et la commande utilisent le même cas d’usage vocal', async () => {
    const commandController = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    commandController.listenForNewMatch()
    await commandController.handleTranscript({ transcript: 'Nouveau match' })

    const buttonController = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await buttonController.startNewMatchVoiceSetup()

    expect(buttonController.getSnapshot().voiceSetup).toEqual(
      commandController.getSnapshot().voiceSetup,
    )
  })
})
