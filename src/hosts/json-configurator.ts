import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { log } from '../logger.js'

export interface ConfigureFileOptions {
  configToMerge: Record<string, unknown>
  filePath: string
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
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
      existing[key] = { ...existing[key], ...value }
    } else {
      existing[key] = value
    }
  }

  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(existing, null, 2) + '\n')
  renameSync(tmpPath, filePath)

  log.info(`Configured JSON: ${filePath}`)
}
