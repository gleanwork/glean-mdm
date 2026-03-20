import { describe, it, expect } from 'vitest'

import { parseArgs } from './index'

describe('parseArgs', () => {
  it('returns defaults with no arguments', () => {
    const result = parseArgs([])

    expect(result).toEqual({
      dryRun: false,
      showVersion: false,
      skipUpdate: false,
    })
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

  it('parses --config with path', () => {
    expect(parseArgs(['--config', '/custom/path.json']).configPath).toBe('/custom/path.json')
  })

  it('parses --user with username', () => {
    expect(parseArgs(['--user', 'alice']).singleUser).toBe('alice')
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
    const result = parseArgs(['--dry-run', '--skip-update', '--config', '/etc/config.json', '--user', 'bob'])

    expect(result.dryRun).toBe(true)
    expect(result.skipUpdate).toBe(true)
    expect(result.configPath).toBe('/etc/config.json')
    expect(result.singleUser).toBe('bob')
  })

  it('ignores unknown flags', () => {
    const result = parseArgs(['--unknown', '--dry-run'])

    expect(result.dryRun).toBe(true)
    expect(result.showVersion).toBe(false)
  })
})
