import { demoAuthService, demoIdentityService, demoScanService } from './demo'
import { liveScanService } from './live'

// Demo services run entirely in the browser on synthetic data. The live scan
// service talks to the backend. Live sign-in is a full-page OAuth redirect
// (see api/endpoints.ts startOAuthUrl), so it has no service object here.
export const identityService = demoIdentityService
export const authService = demoAuthService
export const scanServices = { demo: demoScanService, live: liveScanService }

export * from './types'
