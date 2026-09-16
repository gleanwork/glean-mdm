import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readMcpConfig, readMdmConfig } from './config'
import { installExtensions } from './extensions/index'
import { configureHosts } from './hosts/index'
import { setupProgram } from './index'
import { log } from './logger'
import { withRunLock } from './run-lock'
import { installSchedule, uninstallSchedule } from './scheduler'
import { fullUninstall } from './uninstaller'
import { checkForUpdate } from './updater'
import { enumerateUsers, lookupUser } from './users'

vi.mock('./config', async (importOriginal) => ({
  ...await importOriginal<typeof import('./config')>(),
  readMcpConfig: vi.fn(),
  readMdmConfig: vi.fn(),
}))
vi.mock('./extensions/index', () => ({ installExtensions: vi.fn() }))
vi.mock('./hosts/index', () => ({ configureHosts: vi.fn() }))
vi.mock('./logger', () => ({ initLogger: vi.fn(), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./run-lock', () => ({ withRunLock: vi.fn() }))
vi.mock('./scheduler', () => ({ installSchedule: vi.fn(), uninstallSchedule: vi.fn() }))
vi.mock('./uninstaller', () => ({ fullUninstall: vi.fn() }))
vi.mock('./updater', () => ({ checkForUpdate: vi.fn() }))
vi.mock('./users', () => ({ enumerateUsers: vi.fn(), lookupUser: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(withRunLock).mockImplementation(async (run) => { await run(); return true })
})

function expectNoLegacyWork(): void {
  for (const operation of [readMcpConfig, readMdmConfig, installExtensions, configureHosts, fullUninstall, checkForUpdate, enumerateUsers, lookupUser]) {
    expect(operation).not.toHaveBeenCalled()
  }
}

async function run(args: string[]): Promise<void> {
  await setupProgram().parseAsync(args, { from: 'user' })
}

describe('retirement CLI', () => {
  it.each([
    ['run'],
    ['run', '--skip-update'], // Arguments supplied by the old updating parent.
    ['run', '--mcp-config', '/missing/mcp.json', '--mdm-config', '/invalid/mdm.json', '--user', 'missing-user'],
  ])('retires without reading configs, updating, provisioning, or deleting itself: %j', async (...args) => {
    await run(args)
    expect(withRunLock).toHaveBeenCalledTimes(1)
    expect(uninstallSchedule).toHaveBeenCalledExactlyOnceWith({ dryRun: false })
    expect(installSchedule).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('glean-helper'))
    expectNoLegacyWork()
  })

  it('passes dry-run through to schedule removal', async () => {
    await run(['run', '--dry-run', '--skip-update'])
    expect(uninstallSchedule).toHaveBeenCalledExactlyOnceWith({ dryRun: true })
    expectNoLegacyWork()
  })

  it('respects an overlapping invocation holding the run lock', async () => {
    vi.mocked(withRunLock).mockResolvedValue(false)
    await run(['run'])
    expect(uninstallSchedule).not.toHaveBeenCalled()
    expectNoLegacyWork()
  })

  it('propagates retirement errors to the CLI error handler', async () => {
    vi.mocked(uninstallSchedule).mockImplementation(() => { throw new Error('Access denied') })
    await expect(run(['run'])).rejects.toThrow('Access denied')
    expectNoLegacyWork()
  })

  it('keeps install-schedule accepted for old deployment scripts', async () => {
    await run(['install-schedule'])
    expect(installSchedule).toHaveBeenCalledTimes(1)
    expect(uninstallSchedule).not.toHaveBeenCalled()
    expectNoLegacyWork()
  })

  it('also supports dry-run for explicit schedule removal', async () => {
    await run(['uninstall-schedule', '--dry-run'])
    expect(uninstallSchedule).toHaveBeenCalledExactlyOnceWith({ dryRun: true })
  })
})
