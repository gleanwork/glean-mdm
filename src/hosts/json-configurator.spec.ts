import { lstatSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, beforeEach } from 'vitest'

import { configureJsonFile } from './json-configurator'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mdm-json-test-'))
})

describe('configureJsonFile', () => {
  it('creates a new config file when none exists', () => {
    const filePath = join(tempDir, 'mcp.json')

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result).toEqual({
      mcpServers: {
        glean_default: {
          type: 'http',
          url: 'https://example-be.glean.com/mcp/default',
        },
      },
    })
  })

  it('merges into an existing config preserving other entries', () => {
    const filePath = join(tempDir, 'mcp.json')
    writeFileSync(
      filePath,
      JSON.stringify({
        mcpServers: {
          other_server: { type: 'sse', url: 'https://other.com' },
        },
        someOtherSetting: true,
      }),
    )

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result.mcpServers.other_server).toEqual({
      type: 'sse',
      url: 'https://other.com',
    })
    expect(result.mcpServers.glean_default).toEqual({
      type: 'http',
      url: 'https://example-be.glean.com/mcp/default',
    })
    expect(result.someOtherSetting).toBe(true)
  })

  it('overwrites an existing entry for the same server name', () => {
    const filePath = join(tempDir, 'mcp.json')
    writeFileSync(
      filePath,
      JSON.stringify({
        mcpServers: {
          glean_default: { type: 'sse', url: 'https://old.com' },
        },
      }),
    )

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_default: {
            type: 'http',
            url: 'https://new-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result.mcpServers.glean_default).toEqual({
      type: 'http',
      url: 'https://new-be.glean.com/mcp/default',
    })
  })

  it('is idempotent — running twice produces the same result', () => {
    const filePath = join(tempDir, 'mcp.json')
    const options = {
      configToMerge: {
        mcpServers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    }

    configureJsonFile(options)
    const firstRun = readFileSync(filePath, 'utf-8')

    configureJsonFile(options)
    const secondRun = readFileSync(filePath, 'utf-8')

    expect(firstRun).toBe(secondRun)
  })

  it('handles config with only a url property', () => {
    const filePath = join(tempDir, 'mcp.json')

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_default: {
            serverUrl: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result.mcpServers.glean_default).toEqual({
      serverUrl: 'https://example-be.glean.com/mcp/default',
    })
  })

  it('handles different servers property names', () => {
    const filePath = join(tempDir, 'config.json')

    configureJsonFile({
      configToMerge: {
        mcp: {
          glean_default: {
            type: 'remote',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result.mcp.glean_default).toEqual({
      type: 'remote',
      url: 'https://example-be.glean.com/mcp/default',
    })
  })

  it('skips a new server entry when the same URL already exists under a different name', () => {
    const filePath = join(tempDir, 'mcp.json')
    writeFileSync(
      filePath,
      JSON.stringify({
        mcpServers: {
          glean: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      }),
    )

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result.mcpServers).toEqual({
      glean: {
        type: 'http',
        url: 'https://example-be.glean.com/mcp/default',
      },
    })
  })

  it('preserves existing duplicate URL entries without mutating them', () => {
    const filePath = join(tempDir, 'mcp.json')
    writeFileSync(
      filePath,
      JSON.stringify({
        mcpServers: {
          glean: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
          glean_old: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      }),
    )

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_default: {
            type: 'http',
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result.mcpServers).toEqual({
      glean: {
        type: 'http',
        url: 'https://example-be.glean.com/mcp/default',
      },
      glean_old: {
        type: 'http',
        url: 'https://example-be.glean.com/mcp/default',
      },
    })
  })

  it('deduplicates servers using serverUrl property (Windsurf/Antigravity)', () => {
    const filePath = join(tempDir, 'mcp.json')
    writeFileSync(
      filePath,
      JSON.stringify({
        mcpServers: {
          glean_A: {
            serverUrl: 'https://example-be.glean.com/mcp/default',
            headers: { 'X-Test': 'value' },
          },
        },
      }),
    )

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_B: {
            serverUrl: 'https://example-be.glean.com/mcp/default',
            headers: { 'X-Test': 'value' },
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    // Should only have glean_A, glean_B should be skipped as duplicate
    expect(result.mcpServers).toEqual({
      glean_A: {
        serverUrl: 'https://example-be.glean.com/mcp/default',
        headers: { 'X-Test': 'value' },
      },
    })
  })

  it('deduplicates servers using httpUrl property (Gemini CLI)', () => {
    const filePath = join(tempDir, 'mcp.json')
    writeFileSync(
      filePath,
      JSON.stringify({
        mcpServers: {
          server_first: {
            httpUrl: 'https://example-be.glean.com/mcp/default',
          },
        },
      }),
    )

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          server_second: {
            httpUrl: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    // Should only have server_first, server_second should be skipped as duplicate
    expect(result.mcpServers).toEqual({
      server_first: {
        httpUrl: 'https://example-be.glean.com/mcp/default',
      },
    })
  })

  it('deduplicates across different URL property names', () => {
    const filePath = join(tempDir, 'mcp.json')
    writeFileSync(
      filePath,
      JSON.stringify({
        mcpServers: {
          server_url: {
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      }),
    )

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          server_serverUrl: {
            serverUrl: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    // Should only have server_url, server_serverUrl should be skipped (same URL, different property name)
    expect(result.mcpServers).toEqual({
      server_url: {
        url: 'https://example-be.glean.com/mcp/default',
      },
    })
  })

  it('preserves symlinks and updates the target file', () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'mdm-json-target-'))
    const targetPath = join(targetDir, 'mcp.json')
    writeFileSync(
      targetPath,
      JSON.stringify({
        mcpServers: {
          existing: { type: 'sse', url: 'https://existing.com' },
        },
      }),
    )

    const symlinkPath = join(tempDir, 'mcp.json')
    symlinkSync(targetPath, symlinkPath)

    configureJsonFile({
      configToMerge: {
        mcpServers: {
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

    const result = JSON.parse(readFileSync(targetPath, 'utf-8'))
    expect(result.mcpServers.existing).toEqual({ type: 'sse', url: 'https://existing.com' })
    expect(result.mcpServers.glean_default).toEqual({
      type: 'http',
      url: 'https://example-be.glean.com/mcp/default',
    })
  })

  it("creates parent directories if they don't exist", () => {
    const filePath = join(tempDir, 'nested', 'deep', 'mcp.json')

    configureJsonFile({
      configToMerge: {
        mcpServers: {
          glean_default: {
            url: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = JSON.parse(readFileSync(filePath, 'utf-8'))

    expect(result.mcpServers.glean_default.url).toBe('https://example-be.glean.com/mcp/default')
  })
})
