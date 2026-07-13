export interface ServiceWorkerRegistrar {
  register(
    scriptURL: string,
    options?: RegistrationOptions,
  ): Promise<ServiceWorkerRegistration>
}

export function registerServiceWorker(
  serviceWorker: ServiceWorkerRegistrar,
): Promise<ServiceWorkerRegistration> {
  return serviceWorker.register('/sw.js', { scope: '/' })
}
