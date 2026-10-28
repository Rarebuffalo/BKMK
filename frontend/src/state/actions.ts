import { useNavigate } from 'react-router-dom'
import { isApiError } from '../api/client'
import { api, EXPORT_URL, startOAuthUrl } from '../api/endpoints'
import { useToast } from '../components/ui/Toast'
import type { ScanResult } from '../domain/types'
import { useLive } from './live'
import { useSession } from './session'

/** Account actions that behave correctly in both demo and live mode. */
export function useAccountActions() {
  const navigate = useNavigate()
  const toast = useToast()
  const { state, dispatch } = useSession()
  const live = useLive()
  const isLive = state.mode === 'live'

  const leaveLive = (message: string) => {
    live.clear()
    dispatch({ type: 'mode', mode: 'demo' })
    navigate('/', { replace: true })
    toast(message)
  }

  return {
    isLive,
    rescan(handle: string, scanMode?: 'full' | 'refresh') {
      if (isLive) {
        if (live.me?.connection?.status === 'active') navigate('/scan', { state: { scanMode } })
        else window.location.assign(startOAuthUrl(handle)) // token expired: re-authorize first
        return
      }
      navigate(state.authorized ? '/scan' : '/connect', { state: { handle, reauth: !state.authorized } })
    },
    async disconnect() {
      if (!isLive) {
        dispatch({ type: 'disconnect' })
        navigate('/', { replace: true })
        return
      }
      try {
        const r = await api.disconnect()
        leaveLive(r.revoked ? 'Disconnected. Access revoked and data deleted.' : 'Data deleted. Revoke BKMK.exe in X settings to be sure.')
      } catch (e) {
        toast(isApiError(e) ? e.message : 'Couldn’t disconnect. Try again.', 'warn')
      }
    },
    async deleteAll() {
      if (!isLive) {
        dispatch({ type: 'reset' })
        navigate('/', { replace: true })
        return
      }
      try {
        await api.deleteAccount()
        leaveLive('Your account data was deleted.')
      } catch (e) {
        toast(isApiError(e) ? e.message : 'Couldn’t delete your data. Try again.', 'warn')
      }
    },
    exportData(result: ScanResult) {
      if (isLive) {
        // Same-origin GET with the session cookie; the server sends it as a download.
        window.location.assign(EXPORT_URL)
        return
      }
      const payload = {
        exportedAt: new Date().toISOString(),
        handle: result.handle,
        isDemo: result.isDemo,
        scannedAt: result.scannedAt,
        archetype: result.archetype,
        score: result.score,
        achievements: result.achievements,
        bookmarks: result.bookmarks.map(({ id, author, text, createdAt, url, links, topic, contentType, accessible }) => ({ id, author, text, createdAt, url, links, topic, contentType, accessible })),
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `bkmk-export-${result.handle}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast('Export downloaded')
    },
  }
}
