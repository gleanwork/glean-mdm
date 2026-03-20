import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { getDefaultConfigPath } from './platform.js'

export const MdmConfigSchema = z.object({
  serverName: z.string().min(1),
  url: z.string().min(1),
})

export type MdmConfig = z.infer<typeof MdmConfigSchema>

export function readMdmConfig(configPath?: string): MdmConfig {
  const path = configPath ?? getDefaultConfigPath()
  const raw = readFileSync(path, 'utf-8')
  const json = JSON.parse(raw)
  return MdmConfigSchema.parse(json)
}

export function getServerUrl(config: MdmConfig): string {
  return config.url
}

const MCP_PATH_SUFFIX = /\/mcp\/.*$/

export function getBackendUrl(url: string): string {
  return url.replace(MCP_PATH_SUFFIX, '')
}
