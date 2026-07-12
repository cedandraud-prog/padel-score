import { describe, expect, it, vi } from 'vitest'
import {
  ConversationEngine,
  type ConversationIntent,
} from './ConversationEngine'

describe('ConversationEngine', () => {
  it('passe de MATCH à GUIDED', () => {
    const engine = new ConversationEngine()
    engine.start()
    expect(engine.enterGuidedMode()).toContainEqual({ type: 'EnterGuidedMode' })
    expect(engine.getSnapshot().mode).toBe('GUIDED')
  })

  it('relance la reconnaissance à la fin de la synthèse', () => {
    const engine = new ConversationEngine()
    engine.start()
    engine.beginAnnouncement('Question ?', true)
    expect(engine.handleAnnouncementFinished()).toContainEqual({
      type: 'StartRecognition',
    })
  })

  it('émet le bip après la reprise lorsque la réponse est attendue', () => {
    const engine = new ConversationEngine()
    engine.start()
    engine.beginAnnouncement('Question ?', true)
    engine.handleAnnouncementFinished()
    expect(engine.handleSpeechStarted()).toContainEqual({
      type: 'PlayReadyBeep',
    })
    expect(engine.getSnapshot().state).toBe('PLAYER_LISTENING')
    engine.handleReadyBeepFinished()
    expect(engine.getSnapshot().state).toBe('PLAYER_LISTENING')
  })

  it('n’émet aucun bip sans réponse attendue', () => {
    const engine = new ConversationEngine()
    engine.start()
    engine.beginAnnouncement('Information')
    engine.handleAnnouncementFinished()
    expect(engine.handleSpeechStarted()).not.toContainEqual({
      type: 'PlayReadyBeep',
    })
  })

  it('passe en timeout dans un mode guidé', () => {
    vi.useFakeTimers()
    const intents: ConversationIntent[] = []
    const engine = new ConversationEngine((intent) => intents.push(intent))
    engine.start()
    engine.enterGuidedMode(10_000)
    vi.advanceTimersByTime(10_000)
    expect(intents).toContainEqual({ type: 'Timeout' })
    expect(engine.getSnapshot().state).toBe('TIMEOUT')
    vi.useRealTimers()
  })

  it('sort du mode guidé et reprend l’écoute', () => {
    const engine = new ConversationEngine()
    engine.start()
    engine.enterGuidedMode()
    const intents = engine.manualCancel()
    expect(intents).toContainEqual({ type: 'ExitGuidedMode' })
    expect(engine.getSnapshot()).toMatchObject({
      mode: 'MATCH',
      state: 'PLAYER_LISTENING',
    })
  })

  it('rejette une réponse reçue avant la disponibilité', () => {
    const engine = new ConversationEngine()
    engine.start()
    engine.beginAnnouncement('Question ?', true)
    engine.handleAnnouncementFinished()
    expect(engine.handleSpeech('trop tôt')).not.toContainEqual({
      type: 'ExecuteCommand',
      transcript: 'trop tôt',
    })
    expect(engine.getSnapshot().state).toBe('ERROR')
  })

  it('produit ExecuteCommand pour une réponse écoutée', () => {
    const engine = new ConversationEngine()
    engine.start()
    engine.handleSpeechStarted()
    expect(engine.handleSpeech('Alpha')).toContainEqual({
      type: 'ExecuteCommand',
      transcript: 'Alpha',
    })
  })
})
