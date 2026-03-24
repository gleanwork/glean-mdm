import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { getDefaultConfigPath } from './platform.js'

const SEMVER_PATTERN = /^v?\d+\.\d+\.\d+$/

export const MdmConfigSchema = z.object({
  serverName: z.string().min(1),
  url: z.string().min(1),
  autoUpdate: z.preprocess((val) => (typeof val === 'boolean' ? val : true), z.boolean()),
  pinnedVersion: z.preprocess(
    (val) => (typeof val === 'string' && SEMVER_PATTERN.test(val) ? val : undefined),
    z.string().optional(),
  ),
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
