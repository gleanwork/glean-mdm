import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import * as TOML from 'smol-toml'

import { log } from '../logger.js'

import { isPlainObject, withoutDuplicateUrls } from './utils.js'

export interface ConfigureFileOptions {
  configToMerge: Record<string, unknown>
  filePath: string
}

export function configureTomlFile(options: ConfigureFileOptions): void {
  const { configToMerge, filePath } = options

  let existing: Record<string, unknown> = {}
  try {
    existing = TOML.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  } catch {
    // Start fresh
  }

  for (const [key, value] of Object.entries(configToMerge)) {
    if (isPlainObject(value) && isPlainObject(existing[key])) {
      const filtered = withoutDuplicateUrls(existing[key], value)
      existing[key] = { ...existing[key], ...filtered }
    } else {
      existing[key] = value
    }
  }

  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, TOML.stringify(existing))
  renameSync(tmpPath, filePath)

  log.info(`Configured TOML: ${filePath}`)
}
