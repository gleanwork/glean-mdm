import { execSync } from 'node:child_process'

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
}))

vi.mock('./logger.js', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./platform.js', () => ({
  getPlatform: vi.fn(),
}))

import { getPlatform } from './platform.js'
import { enumerateUsers } from './users'

const mockExecSync = execSync as Mock
const mockGetPlatform = getPlatform as Mock

beforeEach(() => {
  vi.clearAllMocks()
})

describe('enumerateUsers failure behavior', () => {
  it('throws when the macOS user list command fails', () => {
    mockGetPlatform.mockReturnValue('darwin')
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'dscl . -list /Users UniqueID') throw new Error('dscl failed')
      return ''
    })

    expect(() => enumerateUsers()).toThrow('dscl failed')
  })

  it('throws when the Linux passwd lookup fails', () => {
    mockGetPlatform.mockReturnValue('linux')
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'getent passwd') throw new Error('getent failed')
      return ''
    })

    expect(() => enumerateUsers()).toThrow('getent failed')
  })

  it('skips a macOS user when PrimaryGroupID cannot be read', () => {
    mockGetPlatform.mockReturnValue('darwin')
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'dscl . -list /Users UniqueID') return 'alice 501\n'
      if (command === 'dscl . -read /Users/alice NFSHomeDirectory') return 'NFSHomeDirectory: /Users/alice\n'
      if (command === 'dscl . -read /Users/alice PrimaryGroupID') throw new Error('gid failed')
      throw new Error(`unexpected command: ${command}`)
    })

    expect(enumerateUsers()).toEqual([])
  })
})
