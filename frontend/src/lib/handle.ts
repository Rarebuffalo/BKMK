// X handle rules: 4–15 characters for new accounts, but older accounts can be
// as short as 1. Letters, digits and underscores only.
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/

/** Accepts "@name", "name", or a pasted x.com / twitter.com profile URL. */
export function normalizeHandle(input: string): string {
  let v = input.trim()
  const url = v.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i)
  if (url) v = url[1]
  return v.replace(/^@+/, '')
}

export type HandleValidation = { ok: true; handle: string } | { ok: false; reason: string } | { ok: null }

export function validateHandle(input: string): HandleValidation {
  const handle = normalizeHandle(input)
  if (!handle) return { ok: null }
  if (handle.length > 15) return { ok: false, reason: 'X handles are 15 characters or fewer.' }
  if (!HANDLE_RE.test(handle)) return { ok: false, reason: 'Only letters, numbers and underscores.' }
  return { ok: true, handle }
}
