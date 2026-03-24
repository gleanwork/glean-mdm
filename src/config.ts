import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { getDefaultMcpConfigPath, getDefaultMdmConfigPath } from './platform.js'

const SEMVER_PATTERN = /^v?\d+\.\d+\.\d+$/

const McpServerEntrySchema = z.object({
  serverName: z.string().min(1),
  url: z.string().min(1),
})

export const McpConfigSchema = z
  .union([z.array(McpServerEntrySchema).min(1), McpServerEntrySchema])
  .transform((val) => (Array.isArray(val) ? val : [val]))

export const MdmConfigSchema = z.object({
  autoUpdate: z.preprocess((val) => (typeof val === 'boolean' ? val : true), z.boolean()),
  pinnedVersion: z.preprocess(
    (val) => (typeof val === 'string' && SEMVER_PATTERN.test(val) ? val : undefined),
    z.string().optional(),
  ),
  binaryUrlPrefix: z.preprocess(
    (val) => (typeof val === 'string' && val.length > 0 ? val.replace(/\/+$/, '') : val),
    z.string().url(),
  ),
})

export type McpServerEntry = z.infer<typeof McpServerEntrySchema>
export type McpConfig = { servers: McpServerEntry[] }
export type MdmConfig = z.infer<typeof MdmConfigSchema>

export function readMcpConfig(configPath?: string): McpConfig {
  const path = configPath ?? getDefaultMcpConfigPath()
  const raw = readFileSync(path, 'utf-8')
  const json = JSON.parse(raw)
  const servers = McpConfigSchema.parse(json)
  return { servers }
}

export function readMdmConfig(configPath?: string): MdmConfig {
  const path = configPath ?? getDefaultMdmConfigPath()
  const raw = readFileSync(path, 'utf-8')
  const json = JSON.parse(raw)
  return MdmConfigSchema.parse(json)
}

export function getServerUrl(server: McpServerEntry): string {
  return server.url
}

const MCP_PATH_SUFFIX = /\/mcp\/.*$/

export function getBackendUrl(url: string): string {
  return url.replace(MCP_PATH_SUFFIX, '')
}
