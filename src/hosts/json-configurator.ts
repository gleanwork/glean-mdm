import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { log } from '../logger.js'

import { isPlainObject, resolveWritePath, withoutDuplicateUrls } from './utils.js'

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
    if (isPlainObject(value)) {
      const existingSection = isPlainObject(existing[key]) ? existing[key] : {}
      const filtered = withoutDuplicateUrls(existingSection, value)
      existing[key] = { ...existingSection, ...filtered }
    } else {
      existing[key] = value
    }
  }

  const writePath = resolveWritePath(filePath)
  mkdirSync(dirname(writePath), { recursive: true })
  const tmpPath = `${writePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(existing, null, 2) + '\n')
  renameSync(tmpPath, writePath)

  log.info(`Configured JSON: ${filePath}`)
}
