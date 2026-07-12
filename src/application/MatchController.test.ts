import { describe, expect, it, vi } from 'vitest'
import type {
  CommandFeedbackAdapter,
  FeedbackMode,
  RecognitionAdapter,
  RecognitionHandlers,
  ReadinessCueAdapter,
  SynthesisAdapter,
} from '../voice/speechTypes'
import { MatchController } from './MatchController'

class MockRecognition implements RecognitionAdapter {
  startCount = 0
  stopCount = 0
  disposeCount = 0
  handlers: RecognitionHandlers | null = null

  constructor(
    readonly isSupported = true,
    private readonly autoStart = true,
  ) {}

  start(handlers: RecognitionHandlers): void {
    this.startCount += 1
    this.handlers = handlers
    if (this.autoStart) handlers.onStart()
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
    configuration: {
      teamA: { displayName: 'Lynx', voiceIdentifier: 'Lynx' },
      teamB: { displayName: 'Orques', voiceIdentifier: 'Orques' },
      servingTeam: 'A',
    },
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
    configuration: {
      teamA: { displayName: 'Alpha', voiceIdentifier: 'Alpha' },
      teamB: { displayName: 'Bravo', voiceIdentifier: 'Bravo' },
      servingTeam: 'A',
    },
    feedbackMode: mode,
  })
  return { controller, recognition, synthesis, feedback }
}

describe('MatchController', () => {
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
        configuration: {
          teamA: { displayName: 'Score', voiceIdentifier: 'Score' },
          teamB: { displayName: 'Orques', voiceIdentifier: 'Orques' },
          servingTeam: 'A',
        },
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
        configuration: {
          teamA: { displayName: 'Champion', voiceIdentifier: 'Champion' },
          teamB: { displayName: 'Baltringue', voiceIdentifier: 'Baltringue' },
          servingTeam: 'A',
        },
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
      configuration: {
        teamA: { displayName: 'Champion', voiceIdentifier: 'Champion' },
        teamB: { displayName: 'Baltringue', voiceIdentifier: 'Baltringue' },
        servingTeam: 'A',
      },
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

    const pointPromise = controller.awardPoint('A')
    expect(recognition.stopCount).toBe(1)
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
    const recognition = new MockRecognition()
    createController(recognition)

    recognition.endUnexpectedly()

    expect(recognition.startCount).toBe(2)
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

describe('MatchController configuration', () => {
  it('utilise les identifiants vocaux pour attribuer les points', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Les Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Les Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'B',
      },
    })
    await controller.handleTranscript({ transcript: 'Alpha' })
    await controller.handleTranscript({ transcript: 'Bravo' })
    const snapshot = controller.getSnapshot()
    expect(snapshot.display.teams.A.name).toBe('Les Champions')
    expect(snapshot.display.teams.A.points).toBe('15')
    expect(snapshot.display.teams.B.points).toBe('15')
    expect(snapshot.display.teams.B.isServing).toBe(true)
  })

  it('n’attribue pas de point avec le nom affiché distinct', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Les Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Les Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
    })
    await controller.handleTranscript({ transcript: 'Les Champions' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
  })

  it('mène le parcours vocal jusqu’au démarrage du match', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await controller.startVoiceSetup()
    for (const transcript of [
      'Champions',
      'Conserver',
      'Invincibles',
      'Conserver',
      'Bravo',
      'Démarrer',
    ]) {
      await controller.handleTranscript({ transcript })
    }
    const snapshot = controller.getSnapshot()
    expect(snapshot.phase).toBe('match')
    expect(snapshot.configuration?.teamA.voiceIdentifier).toBe('Alpha')
    expect(snapshot.display.teams.B.isServing).toBe(true)
  })

  it('synchronise immédiatement les valeurs vocales avec la configuration éditée', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await controller.startVoiceSetup()
    await controller.handleTranscript({ transcript: 'Les Baltringues' })
    expect(
      controller.getSnapshot().editingConfiguration.teamA.displayName,
    ).toBe('Les Baltringues')

    await controller.handleTranscript({ transcript: 'Modifier' })
    expect(
      controller.getSnapshot().editingConfiguration.teamA.voiceIdentifier,
    ).toBe('Alpha')
    await controller.handleTranscript({ transcript: 'Tango' })
    expect(
      controller.getSnapshot().editingConfiguration.teamA.voiceIdentifier,
    ).toBe('Tango')
  })

  it('conserve une modification manuelle récente pendant le dialogue vocal', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    await controller.startVoiceSetup()
    await controller.handleTranscript({ transcript: 'Champions' })
    const edited = controller.getSnapshot().editingConfiguration
    edited.teamB.voiceIdentifier = 'Zulu'
    controller.updateEditingConfiguration(edited)
    await controller.handleTranscript({ transcript: 'Conserver' })
    await controller.handleTranscript({ transcript: 'Invincibles' })
    await controller.handleTranscript({ transcript: 'Conserver' })

    expect(controller.getSnapshot().voiceSetup?.prompt).toBe(
      'Qui sert : Alpha ou Zulu ?',
    )
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
      'Transcription vocale obsolète ignorée',
    )
  })

  it('démarre avec l’identifiant manuel courant et ignore l’ancien', async () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    const edited = controller.getSnapshot().editingConfiguration
    edited.teamA.displayName = 'Champions'
    edited.teamB.displayName = 'Invincibles'
    edited.teamA.voiceIdentifier = 'Tango'
    controller.updateEditingConfiguration(edited)
    controller.startMatch({
      configuration: controller.getSnapshot().editingConfiguration,
    })

    await controller.handleTranscript({ transcript: 'Alpha' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('0')
    await controller.handleTranscript({ transcript: 'Tango' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('conserve une modification manuelle du serveur au démarrage', () => {
    const controller = new MatchController(
      new MockRecognition(),
      new MockSynthesis(),
    )
    const edited = controller.getSnapshot().editingConfiguration
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
    ).toBe('Équipe A')
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
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
      feedbackMode: 'BEEP',
    })

    await controller.handleTranscript({ transcript: 'Corrige' })

    expect(feedback.plays).toEqual(['BEEP'])
    expect(readiness.playCount).toBe(1)
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
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
    })
    await controller.handleTranscript({ transcript: 'Alpha' })
    expect(readiness.playCount).toBe(0)
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
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
    })
    const snapshot = controller.getSnapshot()
    expect(snapshot.conversation.state).toBe('STARTING_LISTENING')
    expect(snapshot.microphoneStatus).toBe('starting')
    expect(snapshot.message).not.toContain('Impossible')
    expect(readiness.playCount).toBe(0)
  })

  it('onstart passe à PLAYER_LISTENING', async () => {
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
    })
    recognition.handlers?.onStart()
    await Promise.resolve()
    expect(controller.getSnapshot().conversation.state).toBe('PLAYER_LISTENING')
    expect(controller.getSnapshot().message).toBe('À vous de parler')
  })

  it('ne relance pas un démarrage déjà en cours', () => {
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
    })
    controller.enableListening()
    expect(recognition.startCount).toBe(1)
  })

  it('ignore le onstart tardif d’une ancienne tentative', async () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
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

  it('affiche l’échec après deux timeouts sans onstart', () => {
    vi.useFakeTimers()
    const recognition = new MockRecognition(true, false)
    const controller = new MatchController(recognition, new MockSynthesis())
    controller.startMatch({
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
    })
    vi.advanceTimersByTime(3_200)
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
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
    })
    recognition.handlers?.onStart()
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
      configuration: {
        teamA: { displayName: 'Champions', voiceIdentifier: 'Alpha' },
        teamB: { displayName: 'Invincibles', voiceIdentifier: 'Bravo' },
        servingTeam: 'A',
      },
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
    expect((synthesis as MockSynthesis).spoken).toContain('Confirmer ?')
  })

  it('Annuler reprend la session sans changer le score', async () => {
    const { controller } = createController()
    await controller.awardPoint('A')
    const before = controller.getSnapshot().display
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Annuler' })
    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().session.state).toBe('IN_PROGRESS')
    expect(controller.getSnapshot().display).toEqual(before)
  })

  it('Confirmer termine la session et conserve exactement le score', async () => {
    const { controller, synthesis } = createController()
    await controller.awardPoint('A')
    await controller.awardPoint('B')
    const before = controller.getSnapshot().display
    await controller.handleTranscript({ transcript: 'Fin de match' })
    await controller.handleTranscript({ transcript: 'Confirmer' })
    const snapshot = controller.getSnapshot()
    expect(snapshot.session.state).toBe('FINISHED')
    expect(snapshot.phase).toBe('session-finished')
    expect(snapshot.display).toEqual(before)
    expect((synthesis as MockSynthesis).spoken.at(-1)).toContain(
      'Fin du match.',
    )
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
    expect(controller.getSnapshot().voiceSetup?.step).toBe('team-a-name')
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

  it('annonce le premier prompt puis attend onstart avant le bip', async () => {
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
