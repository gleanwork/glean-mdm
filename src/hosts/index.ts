import { chownSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createGleanRegistry } from '@gleanwork/mcp-config-glean'

import { getServerUrl } from '../config.js'
import type { MdmConfig } from '../config.js'
import { log } from '../logger.js'
import { getPlatform } from '../platform.js'

import { configureJsonFile } from './json-configurator.js'
import { configureTomlFile } from './toml-configurator.js'
import { configureYamlFile } from './yaml-configurator.js'

export interface ConfigureHostsOptions {
  config: MdmConfig
  dryRun?: boolean
  gid?: number
  uid?: number
  userHomeDir: string
  username: string
}

export interface ConfigureResult {
  error?: string
  host: string
  success: boolean
}

function expandConfigPath(configPath: string, userHomeDir: string): string {
  return configPath
    .replace('$HOME', userHomeDir)
    .replace('%USERPROFILE%', userHomeDir)
    .replace('%APPDATA%', `${userHomeDir}\\AppData\\Roaming`)
}

function chownAncestors(filePath: string, stopAt: string, uid: number, gid: number): void {
  const stopDir = resolve(stopAt)
  let dir = dirname(resolve(filePath))
  while (dir.length > stopDir.length && dir.startsWith(stopDir)) {
    try {
      chownSync(dir, uid, gid)
    } catch {
      // Ancestor directory may already exist with restricted permissions
    }
    dir = dirname(dir)
  }
}

export function configureHosts(options: ConfigureHostsOptions): ConfigureResult[] {
  const { config, dryRun, gid, uid, userHomeDir } = options
  const currentPlatform = getPlatform()
  const serverUrl = getServerUrl(config)
  const registry = createGleanRegistry()
  const clients = registry.getClientsByPlatform(currentPlatform)
  const results: ConfigureResult[] = []

  for (const client of clients) {
    const configPath = client.configPath[currentPlatform]
    if (!configPath || !client.userConfigurable) continue

    const resolvedPath = expandConfigPath(configPath, userHomeDir)

    if (dryRun) {
      log.info(`[DRY RUN] Would configure ${client.displayName} at ${resolvedPath}`)
      results.push({ host: client.displayName, success: true })
      continue
    }

    try {
      const builder = registry.createBuilder(client.id)
      const generatedConfig = builder.buildConfiguration({
        headers: { 'X-Glean-Metadata': 'mdm' },
        includeRootObject: true,
        serverName: config.serverName,
        serverUrl,
        transport: 'http',
      })

      mkdirSync(dirname(resolvedPath), { recursive: true })

      const configToMerge = generatedConfig as unknown as Record<string, unknown>

      switch (client.configFormat) {
        case 'json':
          configureJsonFile({ configToMerge, filePath: resolvedPath })
          break
        case 'toml':
          configureTomlFile({ configToMerge, filePath: resolvedPath })
          break
        case 'yaml':
          configureYamlFile({ configToMerge, filePath: resolvedPath })
          break
        default:
          throw new Error(`Unsupported config format: ${client.configFormat}`)
      }

      if (currentPlatform !== 'win32' && uid !== undefined && gid !== undefined) {
        chownSync(resolvedPath, uid, gid)
        chownAncestors(resolvedPath, userHomeDir, uid, gid)
      }

      results.push({ host: client.displayName, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error(`Failed to configure ${client.displayName}: ${message}`)
      results.push({ error: message, host: client.displayName, success: false })
    }
  }

  return results
}
