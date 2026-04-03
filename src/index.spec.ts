import { describe, it, expect } from 'vitest'

import { buildCliOptions } from './index'

describe('buildCliOptions', () => {
  it('builds options for run command with no flags', () => {
    const result = buildCliOptions('run', {})

    expect(result).toEqual({
      subcommand: 'run',
      dryRun: false,
      skipUpdate: false,
      singleUser: undefined,
      mcpConfigPath: undefined,
      mdmConfigPath: undefined,
      serverName: undefined,
      serverUrl: undefined,
      autoUpdate: undefined,
      versionUrl: undefined,
      binaryUrlPrefix: undefined,
      pinnedVersion: undefined,
      outputDir: undefined,
      keepConfig: false,
    })
  })

  it('builds options with global --dry-run flag', () => {
    const result = buildCliOptions('run', { dryRun: true })
    expect(result.dryRun).toBe(true)
  })

  it('builds options with global --skip-update flag', () => {
    const result = buildCliOptions('run', { skipUpdate: true })
    expect(result.skipUpdate).toBe(true)
  })

  it('builds options with --mcp-config path', () => {
    const result = buildCliOptions('run', { mcpConfig: '/custom/mcp.json' })
    expect(result.mcpConfigPath).toBe('/custom/mcp.json')
  })

  it('builds options with --mdm-config path', () => {
    const result = buildCliOptions('run', { mdmConfig: '/custom/mdm.json' })
    expect(result.mdmConfigPath).toBe('/custom/mdm.json')
  })

  it('builds options with --user username', () => {
    const result = buildCliOptions('run', { user: 'alice' })
    expect(result.singleUser).toBe('alice')
  })

  it('builds options for install-schedule subcommand', () => {
    const result = buildCliOptions('install-schedule', {})
    expect(result.subcommand).toBe('install-schedule')
  })

  it('builds options for uninstall-schedule subcommand', () => {
    const result = buildCliOptions('uninstall-schedule', {})
    expect(result.subcommand).toBe('uninstall-schedule')
  })

  it('builds options for uninstall subcommand', () => {
    const result = buildCliOptions('uninstall', {})
    expect(result.subcommand).toBe('uninstall')
  })

  it('builds options with --keep-config flag for uninstall', () => {
    const result = buildCliOptions('uninstall', {}, { keepConfig: true })
    expect(result.keepConfig).toBe(true)
  })

  it('builds options with multiple global flags together', () => {
    const result = buildCliOptions('run', {
      dryRun: true,
      skipUpdate: true,
      mcpConfig: '/etc/mcp.json',
      mdmConfig: '/etc/mdm.json',
      user: 'bob',
    })

    expect(result.dryRun).toBe(true)
    expect(result.skipUpdate).toBe(true)
    expect(result.mcpConfigPath).toBe('/etc/mcp.json')
    expect(result.mdmConfigPath).toBe('/etc/mdm.json')
    expect(result.singleUser).toBe('bob')
  })

  it('builds options for config subcommand', () => {
    const result = buildCliOptions('config', {})
    expect(result.subcommand).toBe('config')
  })

  it('builds options with --server-name value', () => {
    const result = buildCliOptions('config', {}, { serverName: 'glean_default' })
    expect(result.serverName).toBe('glean_default')
  })

  it('builds options with --server-url value', () => {
    const result = buildCliOptions('config', {}, { serverUrl: 'https://example.com/mcp/default' })
    expect(result.serverUrl).toBe('https://example.com/mcp/default')
  })

  it('builds options with --auto-update flag', () => {
    const result = buildCliOptions('config', {}, { autoUpdate: true })
    expect(result.autoUpdate).toBe(true)
  })

  it('builds options with --no-auto-update flag', () => {
    const result = buildCliOptions('config', {}, { autoUpdate: false })
    expect(result.autoUpdate).toBe(false)
  })

  it('builds options with --version-url value', () => {
    const result = buildCliOptions('config', {}, { versionUrl: 'https://example.com/version' })
    expect(result.versionUrl).toBe('https://example.com/version')
  })

  it('builds options with --binary-url-prefix value', () => {
    const result = buildCliOptions('config', {}, { binaryUrlPrefix: 'https://example.com/binaries' })
    expect(result.binaryUrlPrefix).toBe('https://example.com/binaries')
  })

  it('builds options with --pinned-version value', () => {
    const result = buildCliOptions('config', {}, { pinnedVersion: 'v1.2.3' })
    expect(result.pinnedVersion).toBe('v1.2.3')
  })

  it('builds options with --output-dir value', () => {
    const result = buildCliOptions('config', {}, { outputDir: '/tmp/test' })
    expect(result.outputDir).toBe('/tmp/test')
  })

  it('builds options with all config flags together', () => {
    const result = buildCliOptions(
      'config',
      {},
      {
        serverName: 'my_server',
        serverUrl: 'https://example.com/mcp/default',
        autoUpdate: true,
        versionUrl: 'https://example.com/version',
        binaryUrlPrefix: 'https://example.com/binaries',
        pinnedVersion: 'v1.0.0',
        outputDir: '/custom/dir',
      },
    )

    expect(result.subcommand).toBe('config')
    expect(result.serverName).toBe('my_server')
    expect(result.serverUrl).toBe('https://example.com/mcp/default')
    expect(result.autoUpdate).toBe(true)
    expect(result.versionUrl).toBe('https://example.com/version')
    expect(result.binaryUrlPrefix).toBe('https://example.com/binaries')
    expect(result.pinnedVersion).toBe('v1.0.0')
    expect(result.outputDir).toBe('/custom/dir')
  })

  it('builds options combining global and command-specific flags', () => {
    const result = buildCliOptions(
      'config',
      {
        dryRun: true,
        user: 'alice',
      },
      {
        serverName: 'test',
        serverUrl: 'https://test.com',
        autoUpdate: true,
        binaryUrlPrefix: 'https://test.com/bin',
      },
    )

    expect(result.dryRun).toBe(true)
    expect(result.singleUser).toBe('alice')
    expect(result.serverName).toBe('test')
    expect(result.autoUpdate).toBe(true)
  })

  it('handles undefined values correctly', () => {
    const result = buildCliOptions('run', {
      dryRun: undefined,
      skipUpdate: undefined,
    })

    expect(result.dryRun).toBe(false)
    expect(result.skipUpdate).toBe(false)
  })

  it('handles keepConfig default for uninstall', () => {
    const result = buildCliOptions('uninstall', {}, {})
    expect(result.keepConfig).toBe(false)
  })

  it('handles keepConfig true for uninstall', () => {
    const result = buildCliOptions('uninstall', {}, { keepConfig: true })
    expect(result.keepConfig).toBe(true)
  })
})
