import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import { ImportError } from './parse'

// X archives can be gigabytes (media included). Stream the zip and inflate only
// the Likes/bookmark data files (and account.js for the handle); the rest is skipped.

const SLICE = 4 * 1024 * 1024
const WANTED = /(^|\/)data\/(like|bookmark|account)(-part\d+)?\.js$/i

export async function readArchiveZip(file: Blob, onProgress?: (fraction: number) => void): Promise<{ name: string; text: string }[]> {
  const found: { name: string; parts: Uint8Array[]; done: boolean }[] = []
  let failure: unknown = null
  const unzip = new Unzip((entry) => {
    if (!WANTED.test(entry.name)) return
    const rec = { name: entry.name, parts: [] as Uint8Array[], done: false }
    found.push(rec)
    entry.ondata = (err, chunk, final) => {
      if (err) {
        failure = err
        return
      }
      rec.parts.push(chunk)
      if (final) rec.done = true
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough) // stored (uncompressed) entries

  try {
    // Fixed-size slices keep memory flat however large the archive is.
    for (let offset = 0; offset < file.size; offset += SLICE) {
      const chunk = new Uint8Array(await file.slice(offset, offset + SLICE).arrayBuffer())
      unzip.push(chunk)
      onProgress?.(Math.min(1, (offset + chunk.length) / file.size))
      if (failure) break
    }
    if (!failure) unzip.push(new Uint8Array(0), true)
  } catch {
    throw new ImportError('This .zip couldn’t be read. Re-download your X archive and try again.')
  }
  if (failure) throw new ImportError('Part of the archive is damaged, so its Likes couldn’t be read.')
  if (!found.some((f) => !/account/i.test(f.name))) {
    throw new ImportError('No Likes file (data/like.js) in this zip. Is it the archive from X → Settings → Download an archive of your data?')
  }
  const decoder = new TextDecoder()
  return found
    .filter((f) => f.done)
    .map((f) => {
      const bytes = new Uint8Array(f.parts.reduce((n, p) => n + p.length, 0))
      let o = 0
      for (const p of f.parts) {
        bytes.set(p, o)
        o += p.length
      }
      return { name: f.name, text: decoder.decode(bytes) }
    })
}
