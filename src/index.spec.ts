import { describe, it, expect } from 'vitest'

import { parseArgs } from './index'

describe('parseArgs', () => {
  it('returns defaults with no arguments', () => {
    const result = parseArgs([])

    expect(result).toEqual({
      dryRun: false,
      showHelp: false,
      showVersion: false,
      skipUpdate: false,
    })
  })

  it('parses --help flag', () => {
    expect(parseArgs(['--help']).showHelp).toBe(true)
  })

  it('parses -h flag', () => {
    expect(parseArgs(['-h']).showHelp).toBe(true)
  })

  it('parses --version flag', () => {
    expect(parseArgs(['--version']).showVersion).toBe(true)
  })

  it('parses --dry-run flag', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true)
  })

  it('parses --skip-update flag', () => {
    expect(parseArgs(['--skip-update']).skipUpdate).toBe(true)
  })

  it('parses --mcp-config with path', () => {
    expect(parseArgs(['--mcp-config', '/custom/mcp.json']).mcpConfigPath).toBe('/custom/mcp.json')
  })

  it('parses --mdm-config with path', () => {
    expect(parseArgs(['--mdm-config', '/custom/mdm.json']).mdmConfigPath).toBe('/custom/mdm.json')
  })

  it('parses --user with username', () => {
    expect(parseArgs(['--user', 'alice']).singleUser).toBe('alice')
  })

  it('parses run subcommand', () => {
    expect(parseArgs(['run']).subcommand).toBe('run')
  })

  it('parses install-schedule subcommand', () => {
    expect(parseArgs(['install-schedule']).subcommand).toBe('install-schedule')
  })

  it('parses uninstall-schedule subcommand', () => {
    expect(parseArgs(['uninstall-schedule']).subcommand).toBe('uninstall-schedule')
  })

  it('parses uninstall subcommand', () => {
    expect(parseArgs(['uninstall']).subcommand).toBe('uninstall')
  })

  it('parses multiple flags together', () => {
    const result = parseArgs([
      '--dry-run',
      '--skip-update',
      '--mcp-config',
      '/etc/mcp.json',
      '--mdm-config',
      '/etc/mdm.json',
      '--user',
      'bob',
    ])

    expect(result.dryRun).toBe(true)
    expect(result.skipUpdate).toBe(true)
    expect(result.mcpConfigPath).toBe('/etc/mcp.json')
    expect(result.mdmConfigPath).toBe('/etc/mdm.json')
    expect(result.singleUser).toBe('bob')
  })

  it('ignores unknown flags', () => {
    const result = parseArgs(['--unknown', '--dry-run'])

    expect(result.dryRun).toBe(true)
    expect(result.showVersion).toBe(false)
  })

  it('parses config subcommand', () => {
    expect(parseArgs(['config']).subcommand).toBe('config')
  })

  it('parses --server-name with value', () => {
    expect(parseArgs(['config', '--server-name', 'glean_default']).serverName).toBe('glean_default')
  })

  it('parses --server-url with value', () => {
    expect(parseArgs(['config', '--server-url', 'https://example.com/mcp/default']).serverUrl).toBe(
      'https://example.com/mcp/default',
    )
  })

  it('parses --auto-update flag', () => {
    expect(parseArgs(['config', '--auto-update']).autoUpdate).toBe(true)
  })

  it('parses --no-auto-update flag', () => {
    expect(parseArgs(['config', '--no-auto-update']).autoUpdate).toBe(false)
  })

  it('parses --version-url with value', () => {
    expect(parseArgs(['config', '--version-url', 'https://example.com/version']).versionUrl).toBe(
      'https://example.com/version',
    )
  })

  it('parses --binary-url-prefix with value', () => {
    expect(
      parseArgs(['config', '--binary-url-prefix', 'https://example.com/binaries']).binaryUrlPrefix,
    ).toBe('https://example.com/binaries')
  })

  it('parses --pinned-version with value', () => {
    expect(parseArgs(['config', '--pinned-version', 'v1.2.3']).pinnedVersion).toBe('v1.2.3')
  })

  it('parses --output-dir with value', () => {
    expect(parseArgs(['config', '--output-dir', '/tmp/test']).outputDir).toBe('/tmp/test')
  })

  it('parses all config flags together', () => {
    const result = parseArgs([
      'config',
      '--server-name',
      'my_server',
      '--server-url',
      'https://example.com/mcp/default',
      '--auto-update',
      '--version-url',
      'https://example.com/version',
      '--binary-url-prefix',
      'https://example.com/binaries',
      '--pinned-version',
      'v1.0.0',
      '--output-dir',
      '/custom/dir',
    ])

    expect(result.subcommand).toBe('config')
    expect(result.serverName).toBe('my_server')
    expect(result.serverUrl).toBe('https://example.com/mcp/default')
    expect(result.autoUpdate).toBe(true)
    expect(result.versionUrl).toBe('https://example.com/version')
    expect(result.binaryUrlPrefix).toBe('https://example.com/binaries')
    expect(result.pinnedVersion).toBe('v1.0.0')
    expect(result.outputDir).toBe('/custom/dir')
  })
})
