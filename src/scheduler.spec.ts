import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('./logger.js', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./platform.js', () => ({
  getBinaryInstallPath: vi.fn(() => '/usr/local/bin/glean-mdm'),
  getPlatform: vi.fn(),
}))

import { execFileSync, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { getPlatform } from './platform.js'
import { buildMacOSPlist, installSchedule, schtasksCreateArgs } from './scheduler'

const mockExecFileSync = execFileSync as Mock
const mockExecSync = execSync as Mock
const mockGetPlatform = getPlatform as Mock
const mockWriteFileSync = writeFileSync as Mock

beforeEach(() => {
  vi.clearAllMocks()
  mockWriteFileSync.mockReturnValue(undefined)
  mockExecFileSync.mockReturnValue(undefined)
  mockExecSync.mockReturnValue(Buffer.from(''))
})

describe('buildMacOSPlist', () => {
  it('includes the binary path, run subcommand, and schedule', () => {
    const plist = buildMacOSPlist('/usr/local/bin/glean-mdm', 7)

    expect(plist).toContain('<string>/usr/local/bin/glean-mdm</string>')
    expect(plist).toContain('<string>run</string>')
    expect(plist).toContain('<string>com.glean.mdm</string>')
    expect(plist).toContain('<integer>7</integer>')
  })

  it('does not redirect stdout or stderr into the app log file', () => {
    const plist = buildMacOSPlist('/usr/local/bin/glean-mdm', 7)

    expect(plist).not.toContain('StandardOutPath')
    expect(plist).not.toContain('StandardErrorPath')
  })
})

describe('schtasksCreateArgs', () => {
  it('passes the binary path as a single argv element (paths with spaces)', () => {
    const pathWithSpaces = 'C:\\Program Files\\Glean\\glean-mdm.exe'

    expect(schtasksCreateArgs(pathWithSpaces, 7)).toEqual([
      '/Create',
      '/TN',
      'Glean MDM',
      '/TR',
      `"${pathWithSpaces}" run`,
      '/SC',
      'DAILY',
      '/ST',
      '09:07',
      '/RU',
      'SYSTEM',
      '/F',
    ])
  })

  it('zero-pads single-digit minutes', () => {
    const args = schtasksCreateArgs('C:\\glean-mdm.exe', 3)
    expect(args).toContain('09:03')
  })

  it('does not pad two-digit minutes', () => {
    const args = schtasksCreateArgs('C:\\glean-mdm.exe', 45)
    expect(args).toContain('09:45')
  })
})

describe('installSchedule failure behavior', () => {
  it('throws when writing the macOS LaunchDaemon plist fails', () => {
    mockGetPlatform.mockReturnValue('darwin')
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('permission denied')
    })

    expect(() => installSchedule()).toThrow('permission denied')
  })

  it('throws when macOS launchctl bootstrap fails', () => {
    mockGetPlatform.mockReturnValue('darwin')
    mockExecSync.mockImplementation((command: string) => {
      if (command.includes('bootstrap')) throw new Error('bootstrap failed')
      return Buffer.from('')
    })

    expect(() => installSchedule()).toThrow('bootstrap failed')
  })

  it('throws when Linux systemd service or timer writes fail', () => {
    mockGetPlatform.mockReturnValue('linux')
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('read-only filesystem')
    })

    expect(() => installSchedule()).toThrow('read-only filesystem')
  })

  it('throws when Linux systemctl enable fails', () => {
    mockGetPlatform.mockReturnValue('linux')
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'systemctl enable --now glean-mdm.timer') throw new Error('enable failed')
      return Buffer.from('')
    })

    expect(() => installSchedule()).toThrow('enable failed')
  })

  it('throws when Windows schtasks creation fails', () => {
    mockGetPlatform.mockReturnValue('win32')
    mockExecFileSync.mockImplementation(() => {
      throw new Error('schtasks failed')
    })

    expect(() => installSchedule()).toThrow('schtasks failed')
  })

  it('throws when Windows catch-up PowerShell update fails', () => {
    mockGetPlatform.mockReturnValue('win32')
    mockExecSync.mockImplementation(() => {
      throw new Error('powershell failed')
    })

    expect(() => installSchedule()).toThrow('powershell failed')
  })
})
