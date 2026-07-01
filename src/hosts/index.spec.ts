import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildConfiguration: vi.fn((config) => ({
    mcpServers: {
      [config.serverName]: config,
    },
  })),
  configureJsonFile: vi.fn(),
}))

vi.mock('@gleanwork/mcp-config-glean', () => ({
  createGleanRegistry: () => ({
    createBuilder: () => ({ buildConfiguration: mocks.buildConfiguration }),
    getAllConfigs: () => [],
    getClientsByPlatform: () => [
      {
        configFormat: 'json',
        configPath: {
          darwin: '$HOME/.cursor/mcp.json',
          linux: '$HOME/.cursor/mcp.json',
          win32: '%APPDATA%\\Cursor\\mcp.json',
        },
        displayName: 'Cursor',
        id: 'cursor',
        transports: ['http'],
        userConfigurable: true,
      },
    ],
  }),
}))

vi.mock('./json-configurator.js', () => ({
  configureJsonFile: mocks.configureJsonFile,
}))

vi.mock('./toml-configurator.js', () => ({
  configureTomlFile: vi.fn(),
}))

vi.mock('./yaml-configurator.js', () => ({
  configureYamlFile: vi.fn(),
}))

import { configureHosts } from './index.js'

describe('configureHosts', () => {
  beforeEach(() => {
    mocks.buildConfiguration.mockClear()
    mocks.configureJsonFile.mockClear()
  })

  it('passes configured server headers to generated host configs', () => {
    const userHomeDir = mkdtempSync(join(tmpdir(), 'glean-mdm-home-'))

    const results = configureHosts({
      servers: [
        {
          headers: {
            'X-Glean-MCP-Server-Name': 'extension-glean_default',
            'X-Glean-Metadata': 'custom',
          },
          serverName: 'glean_default',
          url: 'https://example.com/mcp/default',
        },
      ],
      userHomeDir,
      username: 'test-user',
    })

    expect(results).toEqual([{ host: 'Cursor', success: true }])
    expect(mocks.buildConfiguration).toHaveBeenCalledWith({
      headers: {
        'X-Glean-Metadata': 'custom',
        'X-Glean-MCP-Server-Name': 'extension-glean_default',
      },
      includeRootObject: true,
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      transport: 'http',
    })
  })
})
