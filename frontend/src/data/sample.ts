import { analyze } from '../domain/analyze'
import type { ScanResult } from '../domain/types'
import { generateDemoBookmarks } from './demoProfile'

let cached: ScanResult | null = null

/** Fixed sample report used for marketing previews on the landing page. */
export function sampleResult(): ScanResult {
  cached ??= analyze({
    handle: 'yourhandle',
    displayName: 'Sample',
    isDemo: true,
    source: 'demo',
    raw: generateDemoBookmarks('demo', 'builder'),
    coverage: 'complete',
    scannedAt: '2026-10-20T12:00:00.000Z',
  })
  return cached
}
