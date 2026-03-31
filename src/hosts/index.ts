import { chownSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createGleanRegistry } from '@gleanwork/mcp-config-glean'

import { getServerUrl } from '../config.js'
import type { McpServerEntry } from '../config.js'
import { log } from '../logger.js'
import { getPlatform } from '../platform.js'

import { configureJsonFile } from './json-configurator.js'
import { configureTomlFile } from './toml-configurator.js'
import { isPlainObject } from './utils.js'
import { configureYamlFile } from './yaml-configurator.js'

export interface ConfigureHostsOptions {
  servers: McpServerEntry[]
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

function deepMergeServerConfigs(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = { ...(result[key] as Record<string, unknown>), ...(value as Record<string, unknown>) }
    } else {
      result[key] = value
    }
  }
  return result
}

export function configureHosts(options: ConfigureHostsOptions): ConfigureResult[] {
  const { servers, dryRun, gid, uid, userHomeDir } = options
  const currentPlatform = getPlatform()
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

      let mergedConfig: Record<string, unknown> = {}
      for (const server of servers) {
        const serverUrl = getServerUrl(server)
        const generatedConfig = builder.buildConfiguration({
          headers: { 'X-Glean-Metadata': 'mdm' },
          includeRootObject: true,
          serverName: server.serverName,
          serverUrl,
          transport: 'http',
        }) as unknown as Record<string, unknown>

        mergedConfig = deepMergeServerConfigs(mergedConfig, generatedConfig)
      }

      mkdirSync(dirname(resolvedPath), { recursive: true })

      switch (client.configFormat) {
        case 'json':
          configureJsonFile({ configToMerge: mergedConfig, filePath: resolvedPath })
          break
        case 'toml':
          configureTomlFile({ configToMerge: mergedConfig, filePath: resolvedPath })
          break
        case 'yaml':
          configureYamlFile({ configToMerge: mergedConfig, filePath: resolvedPath })
          break
        default:
          throw new Error(`Unsupported config format: ${client.configFormat}`)
      }

      if (currentPlatform !== 'win32' && uid !== undefined && gid !== undefined) {
        if (!lstatSync(resolvedPath).isSymbolicLink()) {
          chownSync(resolvedPath, uid, gid)
        }
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
