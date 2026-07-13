export const SCREEN_WAKE_LOCK_WARNING =
  'Votre téléphone peut se mettre en veille pendant le match. Vérifiez temporairement les réglages d’écran pour éviter une interruption.'

export type ScreenWakeLockStatus =
  'inactive' | 'requesting' | 'active' | 'unavailable' | 'error'

export interface ScreenWakeLockSnapshot {
  status: ScreenWakeLockStatus
  warning: string | null
}

export interface WakeLockSentinelAdapter {
  readonly released: boolean
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
  removeEventListener(type: 'release', listener: () => void): void
}

export interface WakeLockAdapter {
  request(type: 'screen'): Promise<WakeLockSentinelAdapter>
}

export interface VisibilityDocumentAdapter {
  readonly visibilityState: DocumentVisibilityState
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

interface ScreenWakeLockEnvironment {
  wakeLock?: WakeLockAdapter
  document: VisibilityDocumentAdapter
}

type Listener = (snapshot: ScreenWakeLockSnapshot) => void

function browserEnvironment(): ScreenWakeLockEnvironment {
  const navigatorWithWakeLock = navigator as Navigator & {
    wakeLock?: WakeLockAdapter
  }

  return {
    wakeLock: navigatorWithWakeLock.wakeLock,
    document,
  }
}

export class ScreenWakeLockManager {
  private readonly wakeLock?: WakeLockAdapter
  private readonly document: VisibilityDocumentAdapter
  private readonly listeners = new Set<Listener>()
  private sentinel: WakeLockSentinelAdapter | null = null
  private acquisition: Promise<void> | null = null
  private matchActive = false
  private destroyed = false
  private snapshot: ScreenWakeLockSnapshot = {
    status: 'inactive',
    warning: null,
  }

  constructor(environment: ScreenWakeLockEnvironment = browserEnvironment()) {
    this.wakeLock = environment.wakeLock
    this.document = environment.document
    this.document.addEventListener('visibilitychange', this.handleVisibility)
  }

  getSnapshot(): ScreenWakeLockSnapshot {
    return { ...this.snapshot }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  async setMatchActive(active: boolean): Promise<void> {
    if (this.destroyed) return
    this.matchActive = active

    if (!active) {
      await this.release()
      this.updateSnapshot('inactive', null)
      return
    }

    await this.acquire()
  }

  dismissWarning(): void {
    if (this.snapshot.warning === null) return
    this.updateSnapshot(this.snapshot.status, null)
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return
    this.destroyed = true
    this.matchActive = false
    this.document.removeEventListener('visibilitychange', this.handleVisibility)
    await this.release()
    this.listeners.clear()
  }

  private acquire(): Promise<void> {
    if (
      this.destroyed ||
      !this.matchActive ||
      this.document.visibilityState !== 'visible' ||
      this.sentinel !== null
    ) {
      return Promise.resolve()
    }
    if (this.acquisition !== null) return this.acquisition

    if (!this.wakeLock) {
      this.updateSnapshot('unavailable', SCREEN_WAKE_LOCK_WARNING)
      return Promise.resolve()
    }

    this.updateSnapshot('requesting', null)
    const acquisition = this.requestWakeLock()
    this.acquisition = acquisition
    void acquisition.finally(() => {
      if (this.acquisition === acquisition) this.acquisition = null
    })
    return acquisition
  }

  private async requestWakeLock(): Promise<void> {
    try {
      const sentinel = await this.wakeLock!.request('screen')
      if (
        this.destroyed ||
        !this.matchActive ||
        this.document.visibilityState !== 'visible'
      ) {
        await sentinel.release()
        return
      }

      this.sentinel = sentinel
      sentinel.addEventListener('release', this.handleSentinelRelease)
      this.updateSnapshot('active', null)
    } catch {
      if (this.destroyed || !this.matchActive) return
      this.updateSnapshot('error', SCREEN_WAKE_LOCK_WARNING)
    }
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel
    this.sentinel = null
    if (!sentinel) return

    sentinel.removeEventListener('release', this.handleSentinelRelease)
    if (!sentinel.released) {
      try {
        await sentinel.release()
      } catch {
        // La fin du match ne doit jamais être bloquée par le système.
      }
    }
  }

  private readonly handleSentinelRelease = (): void => {
    const sentinel = this.sentinel
    if (!sentinel) return

    sentinel.removeEventListener('release', this.handleSentinelRelease)
    this.sentinel = null
    if (!this.matchActive || this.destroyed) return

    this.updateSnapshot('inactive', null)
    if (this.document.visibilityState === 'visible') void this.acquire()
  }

  private readonly handleVisibility = (): void => {
    if (
      this.document.visibilityState === 'visible' &&
      this.matchActive &&
      !this.destroyed
    ) {
      void this.acquire()
    }
  }

  private updateSnapshot(
    status: ScreenWakeLockStatus,
    warning: string | null,
  ): void {
    this.snapshot = { status, warning }
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
