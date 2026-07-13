import { describe, expect, it, vi } from 'vitest'
import {
  SCREEN_WAKE_LOCK_WARNING,
  ScreenWakeLockManager,
  type VisibilityDocumentAdapter,
  type WakeLockAdapter,
  type WakeLockSentinelAdapter,
} from './ScreenWakeLockManager'

class FakeDocument implements VisibilityDocumentAdapter {
  visibilityState: DocumentVisibilityState = 'visible'
  private readonly listeners = new Set<() => void>()

  addEventListener(type: 'visibilitychange', listener: () => void): void {
    if (type === 'visibilitychange') this.listeners.add(listener)
  }

  removeEventListener(type: 'visibilitychange', listener: () => void): void {
    if (type === 'visibilitychange') this.listeners.delete(listener)
  }

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state
    this.listeners.forEach((listener) => listener())
  }
}

class FakeSentinel implements WakeLockSentinelAdapter {
  released = false
  private readonly listeners = new Set<() => void>()
  readonly release = vi.fn(async () => this.emitRelease())

  addEventListener(type: 'release', listener: () => void): void {
    if (type === 'release') this.listeners.add(listener)
  }

  removeEventListener(type: 'release', listener: () => void): void {
    if (type === 'release') this.listeners.delete(listener)
  }

  emitRelease(): void {
    if (this.released) return
    this.released = true
    this.listeners.forEach((listener) => listener())
  }
}

function createHarness(sentinels = [new FakeSentinel()]) {
  const document = new FakeDocument()
  const request = vi.fn<WakeLockAdapter['request']>()
  sentinels.forEach((sentinel) => request.mockResolvedValueOnce(sentinel))
  const manager = new ScreenWakeLockManager({
    document,
    wakeLock: { request },
  })
  return { document, manager, request, sentinels }
}

describe('ScreenWakeLockManager', () => {
  it('acquiert un wake lock au démarrage effectif du match', async () => {
    const { manager, request } = createHarness()

    await manager.setMatchActive(true)

    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith('screen')
    expect(manager.getSnapshot()).toMatchObject({
      status: 'active',
      warning: null,
      requested: true,
      acquired: true,
    })
  })

  it('ne demande aucun wake lock hors match', () => {
    const { manager, request } = createHarness()

    expect(request).not.toHaveBeenCalled()
    expect(manager.getSnapshot().status).toBe('inactive')
  })

  it('libère le wake lock à la fin du match', async () => {
    const { manager, sentinels } = createHarness()
    await manager.setMatchActive(true)

    await manager.setMatchActive(false)

    expect(sentinels[0].release).toHaveBeenCalledOnce()
    expect(manager.getSnapshot().status).toBe('inactive')
  })

  it('libère le wake lock lors du démontage', async () => {
    const { manager, sentinels } = createHarness()
    await manager.setMatchActive(true)

    await manager.destroy()

    expect(sentinels[0].release).toHaveBeenCalledOnce()
  })

  it('signale discrètement une API indisponible sans lever d’erreur', async () => {
    const manager = new ScreenWakeLockManager({
      document: new FakeDocument(),
    })

    await expect(manager.setMatchActive(true)).resolves.toBeUndefined()
    expect(manager.getSnapshot()).toMatchObject({
      status: 'unavailable',
      warning: SCREEN_WAKE_LOCK_WARNING,
    })
  })

  it('signale discrètement une erreur de request sans bloquer le match', async () => {
    const document = new FakeDocument()
    const request = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const manager = new ScreenWakeLockManager({
      document,
      wakeLock: { request },
    })

    await expect(manager.setMatchActive(true)).resolves.toBeUndefined()
    expect(manager.getSnapshot()).toMatchObject({
      status: 'error',
      warning: SCREEN_WAKE_LOCK_WARNING,
    })
  })

  it('détecte la perte automatique du verrou', async () => {
    const { document, manager, sentinels } = createHarness()
    await manager.setMatchActive(true)
    document.setVisibility('hidden')

    sentinels[0].emitRelease()

    expect(manager.getSnapshot().status).toBe('inactive')
  })

  it('redemande un wake lock au retour au premier plan', async () => {
    const first = new FakeSentinel()
    const second = new FakeSentinel()
    const { document, manager, request } = createHarness([first, second])
    await manager.setMatchActive(true)
    document.setVisibility('hidden')
    first.emitRelease()

    document.setVisibility('visible')
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))

    expect(manager.getSnapshot().status).toBe('active')
  })

  it('ne crée pas plusieurs wake locks simultanés', async () => {
    const document = new FakeDocument()
    const sentinel = new FakeSentinel()
    let resolveRequest: ((value: WakeLockSentinelAdapter) => void) | undefined
    const request = vi.fn(
      () =>
        new Promise<WakeLockSentinelAdapter>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const manager = new ScreenWakeLockManager({
      document,
      wakeLock: { request },
    })

    const first = manager.setMatchActive(true)
    const second = manager.setMatchActive(true)
    expect(request).toHaveBeenCalledOnce()
    resolveRequest?.(sentinel)
    await Promise.all([first, second])

    expect(request).toHaveBeenCalledOnce()
  })

  it('efface l’avertissement après acquittement', async () => {
    const manager = new ScreenWakeLockManager({
      document: new FakeDocument(),
    })
    await manager.setMatchActive(true)

    manager.dismissWarning()

    expect(manager.getSnapshot().warning).toBeNull()
  })

  it('conserve le même verrou pendant une expérience toujours active', async () => {
    const { manager, request, sentinels } = createHarness()
    await manager.setExperienceActive(true)

    await manager.setExperienceActive(true)

    expect(request).toHaveBeenCalledOnce()
    expect(sentinels[0].release).not.toHaveBeenCalled()
  })
})
