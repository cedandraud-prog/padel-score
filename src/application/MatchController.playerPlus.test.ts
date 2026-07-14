import { describe, expect, it } from 'vitest'
import type { PlayerPlusMatchConfiguration } from './matchConfiguration'
import { MatchController } from './MatchController'
import type {
  RecognitionAdapter,
  RecognitionHandlers,
  SynthesisAdapter,
} from '../voice/speechTypes'

class RecognitionMock implements RecognitionAdapter {
  readonly isSupported = true
  handlers: RecognitionHandlers | null = null
  startCount = 0

  start(handlers: RecognitionHandlers): void {
    this.handlers = handlers
    this.startCount += 1
    handlers.onStart()
    handlers.onAudioStart?.()
  }

  stop(): void {}
  dispose(): void {}
}

class SynthesisMock implements SynthesisAdapter {
  readonly isSupported = true
  spoken: string[] = []

  async speak(text: string): Promise<void> {
    this.spoken.push(text)
  }

  cancel(): void {}
}

function configuration(homonyms = false): PlayerPlusMatchConfiguration {
  return {
    mode: 'PLAYERS_PLUS',
    teamA: { displayName: 'Champions', voiceName: 'Rouge' },
    teamB: { displayName: 'Copains', voiceName: 'Bleu' },
    firstServer: 'A1',
    participants: [
      { id: 'A1', teamId: 'A', name: 'Alice', side: 'RIGHT' },
      { id: 'A2', teamId: 'A', name: 'Chloé', side: 'LEFT' },
      {
        id: 'B1',
        teamId: 'B',
        name: homonyms ? 'Camille' : 'Paul',
        side: 'RIGHT',
      },
      {
        id: 'B2',
        teamId: 'B',
        name: homonyms ? 'Camille' : 'Marc',
        side: 'LEFT',
      },
    ],
  }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

async function started(homonyms = false) {
  const recognition = new RecognitionMock()
  const synthesis = new SynthesisMock()
  const controller = new MatchController(recognition, synthesis)
  expect(
    controller.startMatch({ configuration: configuration(homonyms) }),
  ).toBe(true)
  await flush()
  return { controller, recognition, synthesis }
}

async function winGame(controller: MatchController, team: 'A' | 'B') {
  for (let point = 0; point < 4; point += 1) {
    await controller.awardPoint(team)
  }
}

describe('MatchController PLAYER+', () => {
  it('refuse de créer un match avec une configuration incomplète', () => {
    const controller = new MatchController(
      new RecognitionMock(),
      new SynthesisMock(),
    )
    const invalid = configuration()
    invalid.participants = invalid.participants.map((participant) =>
      participant.id === 'B2' ? { ...participant, name: '' } : participant,
    )

    expect(controller.startMatch({ configuration: invalid })).toBe(false)
    expect(controller.getSnapshot().session.state).toBe('NOT_STARTED')
  })

  it('démarre le moteur et expose le premier serveur individuel', async () => {
    const { controller, recognition, synthesis } = await started()
    const snapshot = controller.getSnapshot()

    expect(snapshot.configuration?.mode).toBe('PLAYERS_PLUS')
    expect(snapshot.currentPlayerServer).toMatchObject({
      id: 'A1',
      name: 'Alice',
    })
    expect(snapshot.session.state).toBe('IN_PROGRESS')
    expect(recognition.startCount).toBeGreaterThan(1)
    expect(synthesis.spoken).toContain('Service : Alice.')
  })

  it('entre dans la sélection adverse et bloque le score', async () => {
    const { controller, synthesis } = await started()
    await winGame(controller, 'A')

    const selection = controller.getSnapshot().playerServerSelection
    expect(controller.getSnapshot().phase).toBe('player-server-selection')
    expect(selection).toMatchObject({ purpose: 'SECOND_SERVER', teamId: 'B' })
    expect(selection?.choices.map(({ id }) => id)).toEqual(['B1', 'B2'])
    expect(synthesis.spoken.at(-1)).toBe(
      'Qui sert pour Copains : Paul ou Marc ?',
    )

    await controller.awardPoint('B')
    expect(controller.getSnapshot().display.teams.B.points).toBe('0')
  })

  it('valide manuellement le second serveur et reprend le match', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')

    expect(await controller.selectPlayerServer('B2')).toBe(true)
    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B2')
    await controller.awardPoint('B')
    expect(controller.getSnapshot().display.teams.B.points).toBe('15')
  })

  it('refuse un joueur hors de l’équipe attendue', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')

    expect(await controller.selectPlayerServer('A2')).toBe(false)
    expect(controller.getSnapshot().phase).toBe('player-server-selection')
  })

  it('valide vocalement un nom exact sans fuzzy matching', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')

    await controller.handleTranscript({ transcript: 'Mar' })
    expect(controller.getSnapshot().phase).toBe('player-server-selection')
    await controller.handleTranscript({ transcript: 'Marc' })
    expect(controller.getSnapshot().phase).toBe('match')
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B2')
  })

  it('résout les homonymes par droite ou gauche et conserve le PlayerId', async () => {
    const { controller } = await started(true)
    await winGame(controller, 'A')

    await controller.handleTranscript({ transcript: 'Camille' })
    expect(controller.getSnapshot().playerServerSelection?.awaitingSide).toBe(
      true,
    )
    await controller.handleTranscript({ transcript: 'Gauche' })
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B2')
  })

  it('fait tourner le serveur et annonce le joueur suivant', async () => {
    const { controller, synthesis } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B1')
    await winGame(controller, 'B')

    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('A2')
    expect(synthesis.spoken.at(-1)).toBe('Service : Chloé.')
  })

  it('corrige manuellement le serveur sans modifier le score', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B1')
    await controller.awardPoint('A')
    const score = controller.getSnapshot().display

    await controller.enterServerCorrection()
    expect(controller.getSnapshot().playerServerSelection?.purpose).toBe(
      'CORRECTION',
    )
    await controller.selectPlayerServer('B2')

    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B2')
    expect(controller.getSnapshot().display.teams.A.points).toBe(
      score.teams.A.points,
    )
  })

  it('corrige vocalement le serveur et traite le serveur actif comme no-op', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B1')

    await controller.handleTranscript({ transcript: 'Serveur' })
    await controller.handleTranscript({ transcript: 'Paul' })
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B1')
    expect(controller.getSnapshot().phase).toBe('match')
  })

  it('undo restaure la sélection du second serveur', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B1')

    expect(await controller.undo()).toBe(true)
    expect(controller.getSnapshot().phase).toBe('player-server-selection')
    expect(controller.getSnapshot().playerServerSelection?.purpose).toBe(
      'SECOND_SERVER',
    )
  })

  it('undo restaure le joueur après une correction puis un point', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B1')
    await controller.enterServerCorrection()
    await controller.selectPlayerServer('B2')
    await controller.awardPoint('A')

    await controller.undo()
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B2')
    await controller.undo()
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B1')
  })

  it('utilise toujours les consignes d’équipe pour attribuer les points', async () => {
    const { controller } = await started()

    await controller.handleTranscript({ transcript: 'Rouge' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
    await controller.handleTranscript({ transcript: 'Alice' })
    expect(controller.getSnapshot().display.teams.A.points).toBe('15')
  })

  it('conserve la rotation au nouveau set et l’annonce', async () => {
    const { controller, synthesis } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B1')
    await winGame(controller, 'B')
    for (let game = 0; game < 5; game += 1) await winGame(controller, 'A')

    expect(controller.getSnapshot().display.teams.A.sets).toBe(1)
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B2')
    expect(synthesis.spoken.at(-1)).toContain('Ordre de service conservé')
  })

  it('expose la rotation individuelle pendant un tie-break prolongé', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B1')
    await winGame(controller, 'B')
    for (let game = 1; game < 6; game += 1) {
      await winGame(controller, 'A')
      await winGame(controller, 'B')
    }

    expect(controller.getSnapshot().display.isTieBreak).toBe(true)
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('A1')
    for (let point = 0; point < 8; point += 1) {
      await controller.awardPoint('A')
      await controller.awardPoint('B')
    }
    expect(controller.getSnapshot().display.teams.A.points).toBe(8)
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('A1')
  })

  it('réinitialise totalement l’ordre lors d’un nouveau match', async () => {
    const { controller } = await started()
    await winGame(controller, 'A')
    await controller.selectPlayerServer('B2')
    controller.prepareNewMatch()
    const next = configuration()
    next.firstServer = 'B1'

    expect(controller.startMatch({ configuration: next })).toBe(true)
    expect(controller.getSnapshot().currentPlayerServer?.id).toBe('B1')
    expect(controller.getSnapshot().playerServerSelection).toBeNull()
  })
})
