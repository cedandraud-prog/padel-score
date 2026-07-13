import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContinuousListeningManager } from './ContinuousListeningManager'

afterEach(() => {
  vi.useRealTimers()
})

describe('ContinuousListeningManager', () => {
  it('relance automatiquement après une fin technique inattendue', () => {
    vi.useFakeTimers()
    const restart = vi.fn()
    const manager = new ContinuousListeningManager(restart)
    manager.startFunctionalListening()
    expect(manager.beginTechnicalStart()).toBe(true)
    manager.handleTechnicalStarted()

    manager.handleTechnicalEnded()
    vi.advanceTimersByTime(250)

    expect(restart).toHaveBeenCalledOnce()
  })

  it('ne relance pas après un arrêt fonctionnel explicite', () => {
    vi.useFakeTimers()
    const restart = vi.fn()
    const manager = new ContinuousListeningManager(restart)
    manager.startFunctionalListening()
    manager.beginTechnicalStart()
    manager.handleTechnicalStarted()
    manager.handleTechnicalEnded()

    manager.stopFunctionalListening()
    vi.runAllTimers()

    expect(restart).not.toHaveBeenCalled()
  })

  it('refuse deux démarrages techniques concurrents', () => {
    const manager = new ContinuousListeningManager(() => {})
    manager.startFunctionalListening()

    expect(manager.beginTechnicalStart()).toBe(true)
    expect(manager.beginTechnicalStart()).toBe(false)
  })

  it('augmente progressivement la temporisation après plusieurs échecs', () => {
    vi.useFakeTimers()
    const restart = vi.fn()
    const manager = new ContinuousListeningManager(restart)
    manager.startFunctionalListening()
    manager.beginTechnicalStart()
    manager.recordRecoverableFailure()
    manager.recordRecoverableFailure()
    manager.handleTechnicalEnded()

    vi.advanceTimersByTime(999)
    expect(restart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(restart).toHaveBeenCalledOnce()
  })

  it('réinitialise la temporisation après une reconnaissance réussie', () => {
    vi.useFakeTimers()
    const restart = vi.fn()
    const manager = new ContinuousListeningManager(restart)
    manager.startFunctionalListening()
    manager.beginTechnicalStart()
    manager.recordRecoverableFailure()
    manager.handleTechnicalStarted()
    manager.recordSuccessfulRecognition()
    manager.handleTechnicalEnded()

    vi.advanceTimersByTime(250)

    expect(restart).toHaveBeenCalledOnce()
  })

  it('ne relance pas pendant une suspension technique', () => {
    vi.useFakeTimers()
    const restart = vi.fn()
    const manager = new ContinuousListeningManager(restart)
    manager.startFunctionalListening()
    manager.beginTechnicalStart()
    manager.handleTechnicalStarted()

    manager.suspendTechnicalListening()
    manager.handleTechnicalEnded()
    vi.runAllTimers()

    expect(restart).not.toHaveBeenCalled()
  })

  it('nettoie le timer de relance au démontage', () => {
    vi.useFakeTimers()
    const restart = vi.fn()
    const manager = new ContinuousListeningManager(restart)
    manager.startFunctionalListening()
    manager.beginTechnicalStart()
    manager.handleTechnicalStarted()
    manager.handleTechnicalEnded()

    manager.dispose()
    vi.runAllTimers()

    expect(restart).not.toHaveBeenCalled()
    expect(manager.getSnapshot().restartPending).toBe(false)
  })
})
