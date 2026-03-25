import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { McpConfigSchema, MdmConfigSchema } from './config.js'
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

export function writeConfig(options: WriteConfigOptions): void {
  const outputDir = options.outputDir ?? getDefaultConfigDir()
  mkdirSync(outputDir, { recursive: true })

  const mcpData = [{ serverName: options.serverName, url: options.serverUrl }]
  McpConfigSchema.parse(mcpData)

  const mdmData: Record<string, unknown> = {
    autoUpdate: options.autoUpdate,
    binaryUrlPrefix: options.binaryUrlPrefix,
  }
  if (options.versionUrl !== undefined) mdmData.versionUrl = options.versionUrl
  if (options.pinnedVersion !== undefined) mdmData.pinnedVersion = options.pinnedVersion
  const parsedMdm = MdmConfigSchema.parse(mdmData)

  const mcpPath = join(outputDir, 'mcp-config.json')
  const mcpTmp = `${mcpPath}.tmp`
  writeFileSync(mcpTmp, JSON.stringify(mcpData, null, 2) + '\n')
  renameSync(mcpTmp, mcpPath)

  const mdmPath = join(outputDir, 'mdm-config.json')
  const mdmTmp = `${mdmPath}.tmp`
  writeFileSync(mdmTmp, JSON.stringify(parsedMdm, null, 2) + '\n')
  renameSync(mdmTmp, mdmPath)

  log.info(`Wrote ${mcpPath}`)
  log.info(`Wrote ${mdmPath}`)
}
