// The honest status of "Connect with X". Bookmark import stays off until X gives
// written guidance on a user-authorized method (docs/x-permission-request.md).

export const X_IMPORT_STATUS = {
  eyebrow: 'X import · not enabled',
  title: 'Automatic X bookmark import isn’t enabled yet',
  body: 'We’re preparing to seek guidance and permission from X before building this feature. X hasn’t approved it, so BKMK.exe doesn’t connect to your X account.',
}

/**
 * Optional owner-run link for access updates (a form, a newsletter or a mailto:),
 * set at build time with VITE_ACCESS_UPDATES_URL. Only https: and mailto: links are
 * shown; anything else is ignored, so the button simply doesn't appear.
 */
export function accessUpdatesUrl(raw: string | undefined = import.meta.env.VITE_ACCESS_UPDATES_URL as string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'mailto:' ? url.href : null
  } catch {
    return null
  }
}
