import { describe, expect, it } from 'vitest'
import {
  ConnectionQualityMonitor,
  type ConnectionEnvironment,
} from './ConnectionQualityMonitor'

describe('ConnectionQualityMonitor', () => {
  it('classe un navigateur hors ligne en FAIBLE', () => {
    expect(
      new ConnectionQualityMonitor({
        online: false,
        effectiveType: null,
        rtt: null,
        downlink: null,
      }).getSnapshot().quality,
    ).toBe('FAIBLE')
  })

  it('classe une erreur réseau récente en FAIBLE', () => {
    const monitor = new ConnectionQualityMonitor({
      online: true,
      effectiveType: '4g',
      rtt: 70,
      downlink: 10,
    })
    monitor.recordNetworkError()
    expect(monitor.getSnapshot().quality).toBe('FAIBLE')
  })

  it('classe des données satisfaisantes en BON', () => {
    expect(
      new ConnectionQualityMonitor({
        online: true,
        effectiveType: '4g',
        rtt: 75,
        downlink: 8,
      }).getSnapshot().quality,
    ).toBe('BON')
  })

  it('classe une connexion 3g en MOYEN', () => {
    expect(
      new ConnectionQualityMonitor({
        online: true,
        effectiveType: '3g',
        rtt: 250,
        downlink: 1,
      }).getSnapshot().quality,
    ).toBe('MOYEN')
  })

  it('reste INDISPONIBLE lorsque les API sont absentes', () => {
    expect(
      new ConnectionQualityMonitor({
        online: null,
        effectiveType: null,
        rtt: null,
        downlink: null,
      }).getSnapshot().quality,
    ).toBe('INDISPONIBLE')
  })

  it('se met à jour lors des événements réseau', () => {
    let listener = () => {}
    const environment: ConnectionEnvironment = {
      online: true,
      effectiveType: '4g',
      rtt: 50,
      downlink: 10,
      subscribe(next) {
        listener = next
        return () => {}
      },
      read() {
        return { online: false, effectiveType: null, rtt: null, downlink: null }
      },
    }
    const monitor = new ConnectionQualityMonitor(environment)
    listener()
    expect(monitor.getSnapshot().quality).toBe('FAIBLE')
  })
})
