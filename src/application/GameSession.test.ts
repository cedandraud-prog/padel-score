import { describe, expect, it } from 'vitest'
import { GameSession } from './GameSession'

describe('GameSession', () => {
  it('est initialement NOT_STARTED', () => {
    expect(new GameSession().getSnapshot().state).toBe('NOT_STARTED')
  })

  it('démarre une session', () => {
    const session = new GameSession()
    session.start()
    expect(session.getSnapshot().state).toBe('IN_PROGRESS')
  })

  it('demande une confirmation avant la fin', () => {
    const session = new GameSession()
    session.start()
    expect(session.requestFinish()).toBe(true)
    expect(session.getSnapshot().isFinishConfirmationPending).toBe(true)
  })

  it('termine uniquement après confirmation', () => {
    const session = new GameSession()
    session.start()
    session.requestFinish()
    expect(session.confirmFinish()).toBe(true)
    expect(session.getSnapshot().state).toBe('FINISHED')
  })

  it('annule la confirmation sans terminer la session', () => {
    const session = new GameSession()
    session.start()
    session.requestFinish()
    expect(session.cancelFinish()).toBe(true)
    expect(session.getSnapshot()).toEqual({
      state: 'IN_PROGRESS',
      isFinishConfirmationPending: false,
    })
  })

  it('refuse une demande de fin hors session', () => {
    expect(new GameSession().requestFinish()).toBe(false)
  })

  it('se réinitialise complètement', () => {
    const session = new GameSession()
    session.start()
    session.requestFinish()
    session.confirmFinish()
    session.reset()
    expect(session.getSnapshot()).toEqual({
      state: 'NOT_STARTED',
      isFinishConfirmationPending: false,
    })
  })
})
