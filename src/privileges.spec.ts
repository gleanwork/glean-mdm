import { execSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import { checkAdminPrivileges, requireAdminPrivileges } from './privileges.js'
import * as logger from './logger.js'
import * as platform from './platform.js'

vi.mock('node:child_process')
vi.mock('./logger.js')
vi.mock('./platform.js')

describe('checkAdminPrivileges', () => {
  it('returns true on macOS when running as root', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('darwin')
    vi.spyOn(process, 'geteuid').mockReturnValue(0)
    expect(checkAdminPrivileges()).toBe(true)
  })

  it('returns false on macOS when not running as root', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('darwin')
    vi.spyOn(process, 'geteuid').mockReturnValue(501)
    expect(checkAdminPrivileges()).toBe(false)
  })

  it('returns true on Linux when running as root', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('linux')
    vi.spyOn(process, 'geteuid').mockReturnValue(0)
    expect(checkAdminPrivileges()).toBe(true)
  })

  it('returns false on Linux when not running as root', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('linux')
    vi.spyOn(process, 'geteuid').mockReturnValue(1000)
    expect(checkAdminPrivileges()).toBe(false)
  })

  it('returns true on Windows when net session succeeds', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('win32')
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
    expect(checkAdminPrivileges()).toBe(true)
    expect(execSync).toHaveBeenCalledWith('net session', {
      stdio: 'ignore',
      windowsHide: true,
    })
  })

  it('returns false on Windows when net session fails', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('win32')
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Access denied')
    })
    expect(checkAdminPrivileges()).toBe(false)
  })
})

describe('requireAdminPrivileges', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)

  it('does nothing when privileges are available on Unix', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('darwin')
    vi.spyOn(process, 'geteuid').mockReturnValue(0)
    requireAdminPrivileges('test-command')
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('does nothing when privileges are available on Windows', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('win32')
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
    requireAdminPrivileges('test-command')
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('exits with Windows-specific error when privileges are missing on Windows', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('win32')
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Access denied')
    })

    requireAdminPrivileges('test-command')

    expect(logger.log.error).toHaveBeenCalledWith(
      "Error: The 'test-command' command requires administrator privileges."
    )
    expect(logger.log.error).toHaveBeenCalledWith(
      'Please run this command from an elevated PowerShell or Command Prompt.'
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('exits with Unix-specific error when privileges are missing on Unix', () => {
    vi.mocked(platform.getPlatform).mockReturnValue('darwin')
    vi.spyOn(process, 'geteuid').mockReturnValue(501)

    requireAdminPrivileges('test-command')

    expect(logger.log.error).toHaveBeenCalledWith(
      "Error: The 'test-command' command requires administrator privileges."
    )
    expect(logger.log.error).toHaveBeenCalledWith(
      'Please run this command with sudo (e.g., sudo glean-mdm run).'
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
