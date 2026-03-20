import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as TOML from 'smol-toml'
import { describe, it, expect, beforeEach } from 'vitest'

import { configureTomlFile } from './toml-configurator'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mdm-toml-test-'))
})

describe('configureTomlFile', () => {
  it('creates a new TOML config file when none exists', () => {
    const filePath = join(tempDir, 'config.toml')

    configureTomlFile({
      configToMerge: {
        mcp_servers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = TOML.parse(readFileSync(filePath, 'utf-8')) as Record<string, Record<string, Record<string, string>>>

    expect(result.mcp_servers.glean_default.url).toBe('https://example-be.glean.com/mcp/default')
    expect(result.mcp_servers.glean_default.type).toBe('http')
  })

  it('merges into an existing TOML config preserving other entries', () => {
    const filePath = join(tempDir, 'config.toml')
    writeFileSync(
      filePath,
      TOML.stringify({
        general: { log_level: 'info' },
        mcp_servers: {
          other_server: { type: 'sse', url: 'https://other.com' },
        },
      }),
    )

    configureTomlFile({
      configToMerge: {
        mcp_servers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = TOML.parse(readFileSync(filePath, 'utf-8')) as Record<string, Record<string, Record<string, string>>>

    expect(result.mcp_servers.other_server.url).toBe('https://other.com')
    expect(result.mcp_servers.glean_default.url).toBe('https://example-be.glean.com/mcp/default')
    expect(result.general.log_level).toBe('info')
  })

  it('overwrites an existing entry for the same server name', () => {
    const filePath = join(tempDir, 'config.toml')
    writeFileSync(
      filePath,
      TOML.stringify({
        mcp_servers: {
          glean_default: { type: 'sse', url: 'https://old.com' },
        },
      }),
    )

    configureTomlFile({
      configToMerge: {
        mcp_servers: {
          glean_default: {
            type: 'http',
            url: 'https://new-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = TOML.parse(readFileSync(filePath, 'utf-8')) as Record<string, Record<string, Record<string, string>>>

    expect(result.mcp_servers.glean_default.url).toBe('https://new-be.glean.com/mcp/default')
    expect(result.mcp_servers.glean_default.type).toBe('http')
  })

  it('is idempotent', () => {
    const filePath = join(tempDir, 'config.toml')
    const options = {
      configToMerge: {
        mcp_servers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    }

    configureTomlFile(options)
    const firstRun = readFileSync(filePath, 'utf-8')

    configureTomlFile(options)
    const secondRun = readFileSync(filePath, 'utf-8')

    expect(firstRun).toBe(secondRun)
  })
})
