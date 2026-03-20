import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import YAML from 'yaml'

import { log } from '../logger.js'

export interface ConfigureFileOptions {
  configToMerge: Record<string, unknown>
  filePath: string
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
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
      existing[key] = { ...existing[key], ...value }
    } else {
      existing[key] = value
    }
  }

  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, YAML.stringify(existing))
  renameSync(tmpPath, filePath)

  log.info(`Configured YAML: ${filePath}`)
}
