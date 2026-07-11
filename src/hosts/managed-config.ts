import { log } from '../logger.js'
import { atomicWriteFile, readTextFileIfExists, resolveWritePath, withFileLock } from '../managed-file.js'

import { isPlainObject, withoutDuplicateUrls } from './utils.js'

export interface ConfigureFileOptions {
  configToMerge: Record<string, unknown>
  filePath: string
}

export interface ManagedConfigCodec {
  format: string
  parse: (content: string) => unknown
  serialize: (config: Record<string, unknown>) => string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function mergeManagedConfig(
  existing: Record<string, unknown>,
  configToMerge: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing }

  for (const [key, value] of Object.entries(configToMerge)) {
    if (isPlainObject(value)) {
      const existingSection = isPlainObject(merged[key]) ? merged[key] : {}
      const filtered = withoutDuplicateUrls(existingSection, value)
      merged[key] = { ...existingSection, ...filtered }
    } else {
      merged[key] = value
    }
  }

  return merged
}

export function configureManagedFile(options: ConfigureFileOptions, codec: ManagedConfigCodec): void {
  const { configToMerge, filePath } = options
  const writePath = resolveWritePath(filePath)

  withFileLock(writePath, () => {
    const content = readTextFileIfExists(writePath)
    let existing: Record<string, unknown> = {}

    if (content !== undefined) {
      let parsed: unknown
      try {
        parsed = codec.parse(content)
      } catch (error) {
        throw new Error(`Cannot update invalid ${codec.format} configuration at ${filePath}: ${describeError(error)}`, {
          cause: error,
        })
      }

      if (!isPlainObject(parsed)) {
        throw new Error(`Cannot update ${codec.format} configuration at ${filePath}: root value must be an object`)
      }
      existing = parsed
    }

    const merged = mergeManagedConfig(existing, configToMerge)
    atomicWriteFile(writePath, codec.serialize(merged))
  })

  log.info(`Configured ${codec.format}: ${filePath}`)
}
