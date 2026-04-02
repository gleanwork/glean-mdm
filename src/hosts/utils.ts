import { mkdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { log } from '../logger.js'

export function safeWriteFile(filePath: string, content: string): void {
  const writePath = resolveWritePath(filePath)
  mkdirSync(dirname(writePath), { recursive: true })
  const tmpPath = `${writePath}.tmp`
  try {
    writeFileSync(tmpPath, content)
    renameSync(tmpPath, writePath)
  } catch {
    writeFileSync(writePath, content)
    try {
      unlinkSync(tmpPath)
    } catch {
      // .tmp file may not exist if writeFileSync to tmpPath was the failure
    }
  }
}

export function resolveWritePath(filePath: string): string {
  try {
    return realpathSync(filePath)
  } catch {
    return filePath
  }
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function getEntryUrl(entry: unknown): string | undefined {
  if (!isPlainObject(entry)) return undefined
  const url = entry.url ?? entry.uri
  return typeof url === 'string' ? url : undefined
}

export function withoutDuplicateUrls(
  existingSection: Record<string, unknown>,
  incomingSection: Record<string, unknown>,
): Record<string, unknown> {
  const existingUrls = new Map<string, string>()
  for (const [name, entry] of Object.entries(existingSection)) {
    const url = getEntryUrl(entry)
    if (url) existingUrls.set(url, name)
  }

  const filtered: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(incomingSection)) {
    const url = getEntryUrl(entry)
    if (url && name !== existingUrls.get(url) && existingUrls.has(url)) {
      log.info(`Skipped server "${name}" — URL already configured under "${existingUrls.get(url)}"`)
      continue
    }
    filtered[name] = entry
  }
  return filtered
}
