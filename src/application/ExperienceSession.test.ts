import { describe, expect, it } from 'vitest'
import { ExperienceSession } from './ExperienceSession'

describe('ExperienceSession', () => {
  it('est inactive à l’accueil', () => {
    expect(new ExperienceSession().getSnapshot()).toEqual({
      stage: 'IDLE',
      active: false,
    })
  })

  it('reste active de la configuration au match sans état intermédiaire', () => {
    const session = new ExperienceSession()
    session.beginConfiguration()
    expect(session.getSnapshot().active).toBe(true)
    session.startMatch()
    expect(session.getSnapshot()).toEqual({ stage: 'PLAYING', active: true })
  })

  it('devient inactive à la fin du match', () => {
    const session = new ExperienceSession()
    session.beginConfiguration()
    session.startMatch()
    session.finishMatch()
    expect(session.getSnapshot()).toEqual({ stage: 'FINISHED', active: false })
  })

  it('devient inactive au retour à l’accueil', () => {
    const session = new ExperienceSession()
    session.beginConfiguration()
    session.returnHome()
    expect(session.getSnapshot()).toEqual({ stage: 'IDLE', active: false })
  })
})
