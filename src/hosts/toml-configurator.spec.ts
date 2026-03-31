import { lstatSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
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

  it('preserves symlinks and updates the target file', () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'mdm-toml-target-'))
    const targetPath = join(targetDir, 'config.toml')
    writeFileSync(
      targetPath,
      TOML.stringify({
        mcp_servers: {
          existing: { type: 'sse', url: 'https://existing.com' },
        },
      }),
    )

    const symlinkPath = join(tempDir, 'config.toml')
    symlinkSync(targetPath, symlinkPath)

    configureTomlFile({
      configToMerge: {
        mcp_servers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath: symlinkPath,
    })

    expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(symlinkPath)).toBe(targetPath)

    const result = TOML.parse(readFileSync(targetPath, 'utf-8')) as Record<string, Record<string, Record<string, string>>>
    expect(result.mcp_servers.existing).toEqual({ type: 'sse', url: 'https://existing.com' })
    expect(result.mcp_servers.glean_default).toEqual({
      type: 'http',
      url: 'https://example-be.glean.com/mcp/default',
    })
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
