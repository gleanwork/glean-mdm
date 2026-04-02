import { readFileSync } from 'node:fs'

import { log } from '../logger.js'

import { isPlainObject, safeWriteFile, withoutDuplicateUrls } from './utils.js'

export interface ConfigureFileOptions {
  configToMerge: Record<string, unknown>
  filePath: string
}

export function configureJsonFile(options: ConfigureFileOptions): void {
  const { configToMerge, filePath } = options

  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    // File doesn't exist or isn't valid JSON — start fresh
  }

  for (const [key, value] of Object.entries(configToMerge)) {
    if (isPlainObject(value) && isPlainObject(existing[key])) {
      const filtered = withoutDuplicateUrls(existing[key], value)
      existing[key] = { ...existing[key], ...filtered }
    } else {
      existing[key] = value
    }
  }

  safeWriteFile(filePath, JSON.stringify(existing, null, 2) + '\n')

  log.info(`Configured JSON: ${filePath}`)
}
