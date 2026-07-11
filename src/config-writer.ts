import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { McpConfigSchema, type McpServerEntry, MdmConfigSchema } from './config.js'
import { log } from './logger.js'
import { atomicWriteFile, readTextFileIfExists, resolveWritePath, withFileLock } from './managed-file.js'
import { getDefaultConfigDir } from './platform.js'

export interface WriteConfigOptions {
  serverName: string
  serverUrl: string
  autoUpdate: boolean
  versionUrl?: string
  binaryUrlPrefix: string
  pinnedVersion?: string
  outputDir?: string
}

function readExistingMcpEntries(filePath: string): McpServerEntry[] {
  const raw = readTextFileIfExists(filePath)
  if (raw === undefined) return []
  const json = JSON.parse(raw)
  return McpConfigSchema.parse(json)
}

export function writeConfig(options: WriteConfigOptions): void {
  const outputDir = options.outputDir ?? getDefaultConfigDir()
  mkdirSync(outputDir, { recursive: true })

  const newEntry = { serverName: options.serverName, url: options.serverUrl }
  McpConfigSchema.parse([newEntry])

  const mdmData: Record<string, unknown> = {
    autoUpdate: options.autoUpdate,
    binaryUrlPrefix: options.binaryUrlPrefix,
  }
  if (options.versionUrl !== undefined) mdmData.versionUrl = options.versionUrl
  if (options.pinnedVersion !== undefined) mdmData.pinnedVersion = options.pinnedVersion
  const parsedMdm = MdmConfigSchema.parse(mdmData)

  const mcpPath = join(outputDir, 'mcp-config.json')
  const mcpWritePath = resolveWritePath(mcpPath)
  withFileLock(mcpWritePath, () => {
    const existingEntries = readExistingMcpEntries(mcpWritePath)
    const nameMatch = existingEntries.find((e) => e.serverName === newEntry.serverName)
    const urlMatch = existingEntries.find((e) => e.url === newEntry.url)

    if (nameMatch) {
      log.info(`Skipped ${mcpPath} (entry "${newEntry.serverName}" already exists)`)
    } else if (urlMatch) {
      log.info(`Skipped ${mcpPath} (URL "${newEntry.url}" already configured under "${urlMatch.serverName}")`)
    } else {
      const merged = [...existingEntries, newEntry]
      atomicWriteFile(mcpWritePath, JSON.stringify(merged, null, 2) + '\n')
      log.info(`Added entry "${newEntry.serverName}" to ${mcpPath}`)
    }
  })

  const mdmPath = join(outputDir, 'mdm-config.json')
  const mdmWritePath = resolveWritePath(mdmPath)
  withFileLock(mdmWritePath, () => {
    atomicWriteFile(mdmWritePath, JSON.stringify(parsedMdm, null, 2) + '\n')
  })

  log.info(`Wrote ${mdmPath}`)
}
