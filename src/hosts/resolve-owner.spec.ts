import { type Mock, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'

import { resolveProfileOwner } from './index'

const mockExecFileSync = execFileSync as Mock

afterEach(() => {
  mockExecFileSync.mockReset()
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

  it('returns null when PowerShell returns empty output', () => {
    mockExecFileSync.mockReturnValue('  \r\n')

    expect(resolveProfileOwner('C:\\Users\\johns')).toBeNull()
  })

  it('returns null when PowerShell throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('powershell.exe not found')
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
