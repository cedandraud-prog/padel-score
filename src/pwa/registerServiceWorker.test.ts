import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

describe('registerServiceWorker', () => {
  it('registers the PWA service worker at the application root', async () => {
    const registration = {} as ServiceWorkerRegistration
    const register = vi.fn().mockResolvedValue(registration)

    await expect(registerServiceWorker({ register })).resolves.toBe(
      registration,
    )
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })
})
