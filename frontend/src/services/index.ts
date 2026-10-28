import { demoAuthService, demoIdentityService, demoScanService } from './demo'

// The single swap point for backend integration. Replace each demo service
// with an API-backed implementation of the same interface.
export const identityService = demoIdentityService
export const authService = demoAuthService
export const scanService = demoScanService

export const DEMO_MODE = true

export * from './types'
