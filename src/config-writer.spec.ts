import { lstatSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
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

  it('appends a new server entry when a different serverName exists', () => {
    writeConfig({
      serverName: 'server_a',
      serverUrl: 'https://a.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    writeConfig({
      serverName: 'server_b',
      serverUrl: 'https://b.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const mcp = JSON.parse(readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toHaveLength(2)
    expect(mcp[0]).toEqual({ serverName: 'server_a', url: 'https://a.example.com/mcp/default' })
    expect(mcp[1]).toEqual({ serverName: 'server_b', url: 'https://b.example.com/mcp/default' })
  })

  it('skips mcp-config.json entry when same serverName already exists', () => {
    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://original.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://updated.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const mcp = JSON.parse(readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toHaveLength(1)
    expect(mcp[0].url).toBe('https://original.example.com/mcp/default')
  })

  it('appends to an existing single-object mcp-config.json file', () => {
    const mcpPath = join(outputDir, 'mcp-config.json')
    writeFileSync(
      mcpPath,
      JSON.stringify({ serverName: 'legacy_server', url: 'https://legacy.example.com/mcp/default' }) + '\n',
    )

    writeConfig({
      serverName: 'new_server',
      serverUrl: 'https://new.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const mcp = JSON.parse(readFileSync(mcpPath, 'utf-8'))
    expect(mcp).toHaveLength(2)
    expect(mcp[0]).toEqual({ serverName: 'legacy_server', url: 'https://legacy.example.com/mcp/default' })
    expect(mcp[1]).toEqual({ serverName: 'new_server', url: 'https://new.example.com/mcp/default' })
  })

  it('skips when serverName exists in a single-object format file', () => {
    const mcpPath = join(outputDir, 'mcp-config.json')
    const original = JSON.stringify({ serverName: 'glean_default', url: 'https://legacy.example.com/mcp/default' }) + '\n'
    writeFileSync(mcpPath, original)

    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://new.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const content = readFileSync(mcpPath, 'utf-8')
    expect(content).toBe(original)
  })

  it('always overwrites mdm-config.json even when mcp entry is skipped', () => {
    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: true,
      versionUrl: 'https://example.com/version',
      binaryUrlPrefix: 'https://example.com/binaries-v2',
      outputDir,
    })

    const mdm = JSON.parse(readFileSync(join(outputDir, 'mdm-config.json'), 'utf-8'))
    expect(mdm.autoUpdate).toBe(true)
    expect(mdm.versionUrl).toBe('https://example.com/version')
    expect(mdm.binaryUrlPrefix).toBe('https://example.com/binaries-v2')
  })

  it('preserves symlinks for mcp-config.json and mdm-config.json', () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'glean-mdm-target-'))

    const mcpTarget = join(targetDir, 'mcp-config.json')
    const mdmTarget = join(targetDir, 'mdm-config.json')
    writeFileSync(
      mcpTarget,
      JSON.stringify([{ serverName: 'existing', url: 'https://existing.com/mcp' }]),
    )
    writeFileSync(mdmTarget, JSON.stringify({ autoUpdate: false, binaryUrlPrefix: 'https://old.com/binaries' }))

    const mcpLink = join(outputDir, 'mcp-config.json')
    const mdmLink = join(outputDir, 'mdm-config.json')
    symlinkSync(mcpTarget, mcpLink)
    symlinkSync(mdmTarget, mdmLink)

    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    expect(lstatSync(mcpLink).isSymbolicLink()).toBe(true)
    expect(readlinkSync(mcpLink)).toBe(mcpTarget)
    expect(lstatSync(mdmLink).isSymbolicLink()).toBe(true)
    expect(readlinkSync(mdmLink)).toBe(mdmTarget)

    const mcp = JSON.parse(readFileSync(mcpTarget, 'utf-8'))
    expect(mcp).toEqual([
      { serverName: 'existing', url: 'https://existing.com/mcp' },
      { serverName: 'glean_default', url: 'https://example.com/mcp/default' },
    ])

    const mdm = JSON.parse(readFileSync(mdmTarget, 'utf-8'))
    expect(mdm).toEqual({
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
    })
  })

  it('skips mcp-config.json entry when same URL already exists under a different name', () => {
    writeConfig({
      serverName: 'glean_old',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    writeConfig({
      serverName: 'glean_new',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const mcp = JSON.parse(readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toHaveLength(1)
    expect(mcp[0].serverName).toBe('glean_old')
  })

  it('appends multiple distinct servers across successive calls', () => {
    const base = {
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    } as const

    writeConfig({ ...base, serverName: 'server_a', serverUrl: 'https://a.example.com/mcp' })
    writeConfig({ ...base, serverName: 'server_b', serverUrl: 'https://b.example.com/mcp' })
    writeConfig({ ...base, serverName: 'server_c', serverUrl: 'https://c.example.com/mcp' })

    const mcp = JSON.parse(readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toHaveLength(3)
    expect(mcp.map((e: { serverName: string }) => e.serverName)).toEqual(['server_a', 'server_b', 'server_c'])
  })

  it('normalizes hyphens to underscores in serverName', () => {
    writeConfig({
      serverName: 'glean-default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const mcp = JSON.parse(readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toHaveLength(1)
    expect(mcp[0].serverName).toBe('glean_default')
  })

  it('deduplicates hyphenated serverName against existing underscored entry', () => {
    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    writeConfig({
      serverName: 'glean-default',
      serverUrl: 'https://other.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    const mcp = JSON.parse(readFileSync(join(outputDir, 'mcp-config.json'), 'utf-8'))
    expect(mcp).toHaveLength(1)
    expect(mcp[0].serverName).toBe('glean_default')
  })

  it('skips new entry when existing hyphenated entry normalizes to same name', () => {
    const mcpPath = join(outputDir, 'mcp-config.json')
    writeFileSync(
      mcpPath,
      JSON.stringify([{ serverName: 'glean-default', url: 'https://example.com/mcp/default' }]) + '\n',
    )

    writeConfig({
      serverName: 'glean_default',
      serverUrl: 'https://other.example.com/mcp/default',
      autoUpdate: false,
      binaryUrlPrefix: 'https://example.com/binaries',
      outputDir,
    })

    // The existing entry is recognized as a duplicate after normalization,
    // so no new entry is appended
    const mcp = JSON.parse(readFileSync(mcpPath, 'utf-8'))
    expect(mcp).toHaveLength(1)
  })
})
