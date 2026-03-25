import { readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach } from 'vitest'
import { ZodError } from 'zod'

import { writeConfig } from './config-writer'

describe('writeConfig', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'glean-mdm-test-'))
  })

  it('writes both config files with valid data', () => {
    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const mcp = JSON.parse(readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toEqual([{ serverName: 'glean_default', url: 'https://example.com/mcp/default' }])

    const mdm = JSON.parse(readFileSync(join(outputDir, 'mdm-config.json'), 'utf-8'))
    expect(mdm).toEqual({
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
    })
  })

  it('writes all optional fields when provided', () => {
    writeConfig({
      serverName: 'my_server',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: true,
      versionUrl: 'https://example.com/version',
      binaryUrlPrefix: 'https://example.com/binaries',
      pinnedVersion: 'v1.2.3',
      outputDir,
    })

    const mdm = JSON.parse(readFileSync(join(outputDir, 'mdm-config.json'), 'utf-8'))
    expect(mdm.autoUpdate).toBe(true)
    expect(mdm.versionUrl).toBe('https://example.com/version')
    expect(mdm.pinnedVersion).toBe('v1.2.3')
  })

  it('creates output directory if it does not exist', () => {
    const nested = join(outputDir, 'sub', 'dir')

    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir: nested,
    })

    const mcp = JSON.parse(readFileSync(join(nested, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toHaveLength(1)
  })

  it('strips trailing slashes from binaryUrlPrefix', () => {
    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries///',
      outputDir,
    })

    const mdm = JSON.parse(readFileSync(join(outputDir, 'mdm-config.json'), 'utf-8'))
    expect(mdm.binaryUrlPrefix).toBe('https://example.com/binaries')
  })

  it('throws ZodError when autoUpdate is true but versionUrl is missing', () => {
    expect(() =>
      writeConfig({
        serverName: 'glean_default',
        serverUrl: 'https://example.com/mcp/default',
        autoUpdate: true,
        binaryUrlPrefix: 'https://example.com/binaries',
        outputDir,
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for invalid binaryUrlPrefix', () => {
    expect(() =>
      writeConfig({
        serverName: 'glean_default',
        serverUrl: 'https://example.com/mcp/default',
        autoUpdate: false,
        binaryUrlPrefix: 'not-a-url',
        outputDir,
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for empty serverName', () => {
    expect(() =>
      writeConfig({
        serverName: '',
        serverUrl: 'https://example.com/mcp/default',
        autoUpdate: false,
        binaryUrlPrefix: 'https://example.com/binaries',
        outputDir,
      }),
    ).toThrow(ZodError)
  })

  it('produces identical files when called twice with same args', () => {
    const opts = {
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    } as const

    writeConfig(opts)
    const mcp1 = readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8')
    const mdm1 = readFileSync(join(outputDir, 'mdm-config.json'), 'utf-8')

    writeConfig(opts)
    const mcp2 = readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8')
    const mdm2 = readFileSync(join(outputDir, 'mdm-config.json'), 'utf-8')

    expect(mcp1).toBe(mcp2)
    expect(mdm1).toBe(mdm2)
  })
})
