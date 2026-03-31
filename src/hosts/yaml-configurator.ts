import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import YAML from 'yaml'

import { log } from '../logger.js'

import { isPlainObject, resolveWritePath, withoutDuplicateUrls } from './utils.js'

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

  const writePath = resolveWritePath(filePath)
  mkdirSync(dirname(writePath), { recursive: true })
  const tmpPath = `${writePath}.tmp`
  writeFileSync(tmpPath, YAML.stringify(existing))
  renameSync(tmpPath, writePath)

  log.info(`Configured YAML: ${filePath}`)
}
