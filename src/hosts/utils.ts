import { realpathSync } from 'node:fs'

import { createGleanRegistry } from '@gleanwork/mcp-config-glean'

import { log } from '../logger.js'

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

/**
 * Dynamically collect all URL property names used across all client configs.
 * This ensures we stay in sync with the schema as new clients or property names are added.
 */
function getAllUrlPropertyNames(): string[] {
  const registry = createGleanRegistry()
  const allConfigs = registry.getAllConfigs()
  const urlPropertyNames = new Set<string>()

  for (const config of allConfigs) {
    const httpMapping = config.configStructure?.httpPropertyMapping
    if (httpMapping?.urlProperty) {
      urlPropertyNames.add(httpMapping.urlProperty)
    }
  }

  return Array.from(urlPropertyNames)
}

// Cache the URL property names since they won't change during runtime
const urlPropertyNames = getAllUrlPropertyNames()

function getEntryUrl(entry: unknown): string | undefined {
  if (!isPlainObject(entry)) return undefined

  // Check all URL property names defined in the schema
  for (const propName of urlPropertyNames) {
    const url = entry[propName]
    if (typeof url === 'string') {
      return url
    }
  }

  return undefined
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

  const seenUrls = new Map<string, string>()
  const filtered: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(incomingSection)) {
    const url = getEntryUrl(entry)
    if (url && name !== existingUrls.get(url) && existingUrls.has(url)) {
      log.info(`Skipped server "${name}" — URL already configured under "${existingUrls.get(url)}"`)
      continue
    }
    if (url && seenUrls.has(url)) {
      log.info(`Skipped server "${name}" — URL already in incoming batch under "${seenUrls.get(url)}"`)
      continue
    }
    if (url) {
      seenUrls.set(url, name)
    }
    filtered[name] = entry
  }
  return filtered
}
