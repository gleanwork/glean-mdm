import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { McpConfigSchema, type McpServerEntry, MdmConfigSchema } from './config.js'
import { log } from './logger.js'
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

function resolveWritePath(filePath: string): string {
  try {
    return realpathSync(filePath)
  } catch {
    return filePath
  }
}

function readExistingMcpEntries(filePath: string): McpServerEntry[] {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return []
    }
    throw err
  }
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
  const existingEntries = readExistingMcpEntries(mcpPath)
  const alreadyExists = existingEntries.some((e) => e.serverName === newEntry.serverName)

  if (alreadyExists) {
    log.info(`Skipped ${mcpPath} (entry "${newEntry.serverName}" already exists)`)
  } else {
    const merged = [...existingEntries, newEntry]
    const mcpWritePath = resolveWritePath(mcpPath)
    const mcpTmp = `${mcpWritePath}.tmp`
    writeFileSync(mcpTmp, JSON.stringify(merged, null, 2) + '\n')
    renameSync(mcpTmp, mcpWritePath)
    log.info(`Added entry "${newEntry.serverName}" to ${mcpPath}`)
  }

  const mdmPath = join(outputDir, 'mdm-config.json')
  const mdmWritePath = resolveWritePath(mdmPath)
  const mdmTmp = `${mdmWritePath}.tmp`
  writeFileSync(mdmTmp, JSON.stringify(parsedMdm, null, 2) + '\n')
  renameSync(mdmTmp, mdmWritePath)

  log.info(`Wrote ${mdmPath}`)
}
