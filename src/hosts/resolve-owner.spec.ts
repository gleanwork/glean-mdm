import { type Mock, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { execFileSync } from 'node:child_process'

import { log } from '../logger.js'
import { resolveProfileOwner, setOwnerWindowsBatch } from './index'

const mockExecFileSync = execFileSync as Mock
const mockLogWarn = log.warn as Mock

afterEach(() => {
  mockExecFileSync.mockReset()
  mockLogWarn.mockReset()
})

describe('resolveProfileOwner', () => {
  it('returns the owner from Win32_UserProfile SID translation', () => {
    mockExecFileSync.mockReturnValue('GLEAN_TOUCH\\johns\r\n')

    const result = resolveProfileOwner('C:\\Users\\johns')

    expect(result).toBe('GLEAN_TOUCH\\johns')
  })

  it('uses Win32_UserProfile, not Get-Acl', () => {
    mockExecFileSync.mockReturnValue('GLEAN_TOUCH\\johns\r\n')

    resolveProfileOwner('C:\\Users\\johns')

    const command = mockExecFileSync.mock.calls[0][1][3] as string
    expect(command).toContain('Win32_UserProfile')
    expect(command).not.toContain('Get-Acl')
  })

  it('passes the home directory path in the PowerShell command', () => {
    mockExecFileSync.mockReturnValue('DOMAIN\\user\r\n')

    resolveProfileOwner('C:\\Users\\johns')

    const command = mockExecFileSync.mock.calls[0][1][3] as string
    expect(command).toContain("C:\\Users\\johns")
  })

  it('returns null when PowerShell returns empty output', () => {
    mockExecFileSync.mockReturnValue('  \r\n')

    expect(resolveProfileOwner('C:\\Users\\johns')).toBeNull()
  })

  it('returns null when no profile matches the path', () => {
    mockExecFileSync.mockReturnValue('\r\n')

    expect(resolveProfileOwner('C:\\Users\\nonexistent')).toBeNull()
  })

  it('returns null when PowerShell throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('powershell.exe not found')
    })

    expect(resolveProfileOwner('C:\\Users\\johns')).toBeNull()
  })

  it('returns null on timeout', () => {
    mockExecFileSync.mockImplementation(() => {
      const err = new Error('spawnSync powershell.exe ETIMEDOUT') as NodeJS.ErrnoException
      err.code = 'ETIMEDOUT'
      throw err
    })

    expect(resolveProfileOwner('C:\\Users\\johns')).toBeNull()
  })

  it('escapes single quotes in the home directory path', () => {
    mockExecFileSync.mockReturnValue('DOMAIN\\user\r\n')

    resolveProfileOwner("C:\\Users\\O'Brien")

    const command = mockExecFileSync.mock.calls[0][1][3] as string
    expect(command).toContain("O''Brien")
  })
})

describe('setOwnerWindowsBatch', () => {
  it('does not call PowerShell when paths array is empty', () => {
    setOwnerWindowsBatch([], 'DOMAIN\\user')

    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('calls PowerShell with Set-Acl for a single path', () => {
    mockExecFileSync.mockReturnValue('')

    setOwnerWindowsBatch(['C:\\Users\\johns\\.claude.json'], 'DOMAIN\\johns')

    expect(mockExecFileSync).toHaveBeenCalledOnce()
    const command = mockExecFileSync.mock.calls[0][1][3] as string
    expect(command).toContain('Set-Acl')
    expect(command).toContain('SetOwner')
    expect(command).toContain('C:\\Users\\johns\\.claude.json')
    expect(command).toContain('DOMAIN\\johns')
  })

  it('includes all paths in a single batch command', () => {
    mockExecFileSync.mockReturnValue('')

    const paths = [
      'C:\\Users\\johns\\.claude.json',
      'C:\\Users\\johns\\.cursor\\mcp.json',
      'C:\\Users\\johns\\.cursor',
    ]
    setOwnerWindowsBatch(paths, 'DOMAIN\\johns')

    expect(mockExecFileSync).toHaveBeenCalledOnce()
    const command = mockExecFileSync.mock.calls[0][1][3] as string
    for (const p of paths) {
      expect(command).toContain(p)
    }
  })

  it('escapes single quotes in the owner name', () => {
    mockExecFileSync.mockReturnValue('')

    setOwnerWindowsBatch(['C:\\file.json'], "DOMAIN\\O'Brien")

    const command = mockExecFileSync.mock.calls[0][1][3] as string
    expect(command).toContain("O''Brien")
  })

  it('escapes single quotes in file paths', () => {
    mockExecFileSync.mockReturnValue('')

    setOwnerWindowsBatch(["C:\\Users\\O'Brien\\.claude.json"], 'DOMAIN\\user')

    const command = mockExecFileSync.mock.calls[0][1][3] as string
    expect(command).toContain("O''Brien")
  })

  it('logs a warning and does not throw when PowerShell fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('spawnSync powershell.exe ETIMEDOUT')
    })

    expect(() => setOwnerWindowsBatch(['C:\\file.json'], 'DOMAIN\\user')).not.toThrow()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to batch-set ownership'))
  })
})
