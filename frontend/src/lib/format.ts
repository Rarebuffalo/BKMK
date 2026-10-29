export const fmt = (n: number) => n.toLocaleString('en-US')

export const pct = (x: number) => `${Math.round(x * 100)}%`

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return 'date unknown'
  return new Date(iso).toLocaleDateString('en-GB', opts)
}

export function relativeTime(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return formatDate(iso)
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const PRODUCT_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? window.location.origin
export const PRODUCT_HOST = hostOf(PRODUCT_URL)
