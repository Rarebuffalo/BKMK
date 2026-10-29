import { demoAuthService, demoIdentityService, demoScanService } from './demo'
import { importScanService } from './import'
import { liveScanService } from './live'

// Demo services run entirely in the browser on synthetic data. The live scan
// service talks to the backend. The import service analyses a user's file locally. Live sign-in is a full-page OAuth redirect
// (see api/endpoints.ts startOAuthUrl), so it has no service object here.
export const identityService = demoIdentityService
export const authService = demoAuthService
export const scanServices = { demo: demoScanService, live: liveScanService, import: importScanService }

export * from './types'
