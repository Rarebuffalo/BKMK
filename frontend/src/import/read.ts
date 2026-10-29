import { ImportError, isArchiveScript, mergeParsed, parseFileText, parseText, type ImportItem, type ImportSummary, type ParsedFile } from './parse'
import { readArchiveZip } from './zip'

/** Plain files are read whole; only .zip archives are streamed. */
export const MAX_TEXT_FILE_BYTES = 50 * 1024 * 1024

export interface FileProblem {
  file: string
  message: string
}

export interface ImportReadResult {
  items: ImportItem[]
  summary: ImportSummary
  problems: FileProblem[]
  /** From the archive's account.js, when present. */
  handle?: string
  displayName?: string
}

function accountFrom(text: string): { handle?: string; displayName?: string } {
  try {
    const json = JSON.parse(text.replace(/^\s*window\.YTD\.account\.part\d+\s*=\s*/, ''))
    const acct = json?.[0]?.account
    return { handle: typeof acct?.username === 'string' ? acct.username : undefined, displayName: typeof acct?.accountDisplayName === 'string' ? acct.accountDisplayName : undefined }
  } catch {
    return {}
  }
}

/** Reads every chosen file (and any pasted links). One bad file doesn't sink the rest. */
export async function readImport(files: File[], pasted = '', onProgress?: (label: string, fraction: number) => void): Promise<ImportReadResult> {
  const parsed: ParsedFile[] = []
  const problems: FileProblem[] = []
  let account: { handle?: string; displayName?: string } = {}

  for (const file of files) {
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const entries = await readArchiveZip(file, (f) => onProgress?.(file.name, f))
        for (const e of entries) {
          if (/account\.js$/i.test(e.name)) account = accountFrom(e.text)
          else parsed.push(parseFileText(e.name, e.text))
        }
        continue
      }
      if (file.size > MAX_TEXT_FILE_BYTES) throw new ImportError('This file is over 50 MB. For an X archive, choose the .zip itself or just data/like.js.')
      onProgress?.(file.name, 0)
      const text = await file.text()
      if (/account\.js$/i.test(file.name) && isArchiveScript(text)) {
        account = accountFrom(text)
        continue
      }
      parsed.push(parseFileText(file.name, text))
      onProgress?.(file.name, 1)
    } catch (e) {
      problems.push({ file: file.name, message: e instanceof ImportError ? e.message : 'This file couldn’t be read.' })
    }
  }
  if (pasted.trim()) parsed.push(parseText(pasted))

  const { items, summary } = mergeParsed(parsed)
  return { items, summary, problems, ...account }
}
