import { describe, expect, it, vi } from 'vitest'
import type {
  RecognitionAdapter,
  RecognitionHandlers,
  SynthesisAdapter,
} from '../voice/speechTypes'
import { MatchController } from './MatchController'

class MockRecognition implements RecognitionAdapter {
  startCount = 0
  stopCount = 0
  disposeCount = 0
  handlers: RecognitionHandlers | null = null

  constructor(readonly isSupported = true) {}

  start(handlers: RecognitionHandlers): void {
    this.startCount += 1
    this.handlers = handlers
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

function createController(
  recognition = new MockRecognition(),
  synthesis: SynthesisAdapter = new MockSynthesis(),
) {
  const controller = new MatchController(recognition, synthesis)
  controller.startMatch({
    teamNames: { A: 'Lynx', B: 'Orques' },
    servingTeam: 'A',
  })
  return { controller, recognition, synthesis }
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
        teamNames: { A: 'Score', B: 'Orques' },
        servingTeam: 'A',
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
        teamNames: { A: 'Champion', B: 'Baltringue' },
        servingTeam: 'A',
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
      teamNames: { A: 'Champion', B: 'Baltringue' },
      servingTeam: 'A',
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

  it('arrête l’écoute à la fin du match', async () => {
    const recognition = new MockRecognition()
    const synthesis = new MockSynthesis()
    const { controller } = createController(recognition, synthesis)

    for (let game = 0; game < 12; game += 1) {
      for (let point = 0; point < 4; point += 1) {
        await controller.awardPoint('A')
      }
    }

    expect(controller.getSnapshot().phase).toBe('finished')
    expect(controller.getSnapshot().microphoneStatus).toBe('disabled')
    expect(synthesis.spoken.at(-1)).toContain('victoire des Lynx')
  })

  it('reste utilisable manuellement sans SpeechRecognition', async () => {
    const recognition = new MockRecognition(false)
    const { controller } = createController(recognition)

    expect(controller.getSnapshot().microphoneStatus).toBe('unavailable')
    await controller.awardPoint('A')
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })
})
