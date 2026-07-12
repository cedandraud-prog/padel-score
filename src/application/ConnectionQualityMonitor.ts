export type ConnectionQuality = 'BON' | 'MOYEN' | 'FAIBLE' | 'INDISPONIBLE'
export type EffectiveConnectionType = 'slow-2g' | '2g' | '3g' | '4g'

export interface ConnectionQualitySnapshot {
  quality: ConnectionQuality
  online: boolean | null
  effectiveType: EffectiveConnectionType | null
  rtt: number | null
  downlink: number | null
  recentNetworkErrors: number
  medianRecognitionDelay: number | null
  lastNetworkErrorAt: number | null
}

export interface ConnectionEnvironment {
  online: boolean | null
  effectiveType: EffectiveConnectionType | null
  rtt: number | null
  downlink: number | null
  subscribe?(listener: () => void): () => void
  read?(): Omit<ConnectionEnvironment, 'subscribe' | 'read'>
}

type Listener = (snapshot: ConnectionQualitySnapshot) => void

function browserEnvironment(): ConnectionEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { online: null, effectiveType: null, rtt: null, downlink: null }
  }
  const connection = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: EffectiveConnectionType
        rtt?: number
        downlink?: number
        addEventListener?(type: 'change', listener: () => void): void
        removeEventListener?(type: 'change', listener: () => void): void
      }
    }
  ).connection
  const read = () => ({
    online: navigator.onLine,
    effectiveType: connection?.effectiveType ?? null,
    rtt: connection?.rtt ?? null,
    downlink: connection?.downlink ?? null,
  })
  return {
    ...read(),
    read,
    subscribe(listener) {
      window.addEventListener('online', listener)
      window.addEventListener('offline', listener)
      connection?.addEventListener?.('change', listener)
      return () => {
        window.removeEventListener('online', listener)
        window.removeEventListener('offline', listener)
        connection?.removeEventListener?.('change', listener)
      }
    },
  }
}

export class ConnectionQualityMonitor {
  private environment: ConnectionEnvironment
  private readonly networkErrors: number[] = []
  private readonly recognitionDelays: number[] = []
  private readonly listeners = new Set<Listener>()
  private unsubscribeEnvironment: (() => void) | null = null

  constructor(
    environment: ConnectionEnvironment = browserEnvironment(),
    private readonly now: () => number = () => Date.now(),
  ) {
    this.environment = environment
    this.unsubscribeEnvironment =
      environment.subscribe?.(() => {
        if (environment.read)
          this.environment = { ...environment, ...environment.read() }
        this.emit()
      }) ?? null
  }

  getSnapshot(): ConnectionQualitySnapshot {
    const recentThreshold = this.now() - 5 * 60_000
    const recentErrors = this.networkErrors.filter(
      (time) => time >= recentThreshold,
    )
    const delays = [...this.recognitionDelays].sort((a, b) => a - b)
    const middle = Math.floor(delays.length / 2)
    const median = delays.length
      ? delays.length % 2
        ? delays[middle]
        : (delays[middle - 1] + delays[middle]) / 2
      : null
    const { online, effectiveType, rtt, downlink } = this.environment

    let quality: ConnectionQuality
    if (
      online === false ||
      recentErrors.length > 0 ||
      effectiveType === 'slow-2g' ||
      effectiveType === '2g' ||
      (median !== null && median > 4_000)
    ) {
      quality = 'FAIBLE'
    } else if (
      effectiveType === '3g' ||
      (rtt !== null && rtt > 300) ||
      this.hasIrregularDelays()
    ) {
      quality = 'MOYEN'
    } else if (
      online === true &&
      (effectiveType === '4g' ||
        rtt !== null ||
        downlink !== null ||
        median !== null)
    ) {
      quality = 'BON'
    } else {
      quality = 'INDISPONIBLE'
    }

    return {
      quality,
      online,
      effectiveType,
      rtt,
      downlink,
      recentNetworkErrors: recentErrors.length,
      medianRecognitionDelay: median,
      lastNetworkErrorAt: this.networkErrors.at(-1) ?? null,
    }
  }

  recordNetworkError(): void {
    this.networkErrors.push(this.now())
    this.emit()
  }

  recordRecognitionDelay(delayMs: number): void {
    if (!Number.isFinite(delayMs) || delayMs < 0) return
    this.recognitionDelays.push(delayMs)
    if (this.recognitionDelays.length > 7) this.recognitionDelays.shift()
    this.emit()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.unsubscribeEnvironment?.()
    this.unsubscribeEnvironment = null
    this.listeners.clear()
  }

  private hasIrregularDelays(): boolean {
    if (this.recognitionDelays.length < 3) return false
    return (
      Math.max(...this.recognitionDelays) -
        Math.min(...this.recognitionDelays) >
      2_000
    )
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
