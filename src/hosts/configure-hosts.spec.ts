import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import YAML from 'yaml'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform.js', () => ({
  getPlatform: vi.fn(() => 'linux'),
}))

import { configureHosts } from './index'

let userHomeDir: string

beforeEach(() => {
  userHomeDir = mkdtempSync(join(tmpdir(), 'mdm-hosts-test-'))
})

describe('configureHosts registry output', () => {
  it('writes representative Linux host configs from the real registry builder', () => {
    const results = configureHosts({
      servers: [{ serverName: 'default', url: 'https://be.glean.com/mcp/default' }],
      userHomeDir,
      username: 'alice',
    })

    expect(results.every((result) => result.success)).toBe(true)

    const claude = JSON.parse(readFileSync(join(userHomeDir, '.claude.json'), 'utf-8'))
    expect(claude.mcpServers.glean_default).toEqual({
      type: 'http',
      url: 'https://be.glean.com/mcp/default',
      headers: { 'X-Glean-Metadata': 'mdm' },
    })

    const codex = readFileSync(join(userHomeDir, '.codex', 'config.toml'), 'utf-8')
    expect(codex).toContain('[mcp_servers.glean_default]')
    expect(codex).toContain('url = "https://be.glean.com/mcp/default"')
    expect(codex).toContain('X-Glean-Metadata = "mdm"')

    const goose = YAML.parse(readFileSync(join(userHomeDir, '.config', 'goose', 'config.yaml'), 'utf-8'))
    expect(goose.extensions.glean_default).toEqual({
      enabled: true,
      name: 'glean_default',
      type: 'streamable_http',
      uri: 'https://be.glean.com/mcp/default',
      envs: {},
      env_keys: [],
      headers: { 'X-Glean-Metadata': 'mdm' },
      description: '',
      timeout: 300,
      bundled: null,
      available_tools: [],
    })
  })
})
