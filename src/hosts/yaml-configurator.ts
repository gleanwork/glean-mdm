import { readFileSync } from 'node:fs'

import YAML from 'yaml'

import { log } from '../logger.js'

import { isPlainObject, safeWriteFile, withoutDuplicateUrls } from './utils.js'

export interface ConfigureFileOptions {
  configToMerge: Record<string, unknown>
  filePath: string
}

export function configureYamlFile(options: ConfigureFileOptions): void {
  const { configToMerge, filePath } = options

  let existing: Record<string, unknown> = {}
  try {
    const content = readFileSync(filePath, 'utf-8')
    existing = (YAML.parse(content) as Record<string, unknown>) ?? {}
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

  safeWriteFile(filePath, YAML.stringify(existing))

  log.info(`Configured YAML: ${filePath}`)
}
