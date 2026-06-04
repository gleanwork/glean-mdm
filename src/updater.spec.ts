import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'

import { beforeEach, describe, it, expect, type Mock, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  chmodSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdtempSync: vi.fn(),
  renameSync: vi.fn(),
  rmSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('./logger.js', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./platform.js', () => ({
  getBinaryInstallPath: vi.fn(() => 'C:\\Program Files\\Glean\\glean-mdm.exe'),
  getPlatform: vi.fn(() => 'win32'),
  getTargetName: vi.fn(() => 'windows-x64'),
}))

import { checkForUpdate, compareVersions, shouldUpdate } from './updater'

const mockCopyFileSync = copyFileSync as Mock
const mockExecFileSync = execFileSync as Mock
const mockMkdtempSync = mkdtempSync as Mock
const mockRenameSync = renameSync as Mock
const mockRmSync = rmSync as Mock
const mockUnlinkSync = unlinkSync as Mock
const mockWriteFileSync = writeFileSync as Mock

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }
}

function okBinary(bytes = new Uint8Array([1, 2, 3])) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
    text: vi.fn().mockResolvedValue(''),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
  mockMkdtempSync.mockReturnValue('/tmp/glean-mdm-update-test')
  mockWriteFileSync.mockReturnValue(undefined)
  mockRmSync.mockReturnValue(undefined)
  mockUnlinkSync.mockReturnValue(undefined)
  mockCopyFileSync.mockReturnValue(undefined)
  mockRenameSync.mockReturnValue(undefined)
})

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0)
  })

  it('returns positive when first is newer', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('returns negative when first is older', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('handles v prefix', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v2.0.0', 'v1.0.0')).toBeGreaterThan(0)
  })

  it('handles different number of parts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0)
  })

  it('compares major version first', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('10.0.0', '9.9.9')).toBeGreaterThan(0)
  })
})

describe('shouldUpdate', () => {
  it('returns false when current matches server version', () => {
    expect(shouldUpdate('1.0.0', '1.0.0')).toBe(false)
  })

  it('returns true when server version is newer', () => {
    expect(shouldUpdate('1.0.0', '2.0.0')).toBe(true)
  })

  it('returns true when current is newer than server (downgrade)', () => {
    expect(shouldUpdate('2.0.0', '1.0.0')).toBe(true)
  })

  it('returns false when current matches pinned version', () => {
    expect(shouldUpdate('1.2.3', '2.0.0', '1.2.3')).toBe(false)
  })

  it('returns true when current is older than pinned version', () => {
    expect(shouldUpdate('1.0.0', '2.0.0', '1.2.3')).toBe(true)
  })

  it('returns true when current is ahead of pinned version (downgrade)', () => {
    expect(shouldUpdate('2.0.0', '2.0.0', '1.2.3')).toBe(true)
  })

  it('returns true when current is ahead of pinned version with different server version', () => {
    expect(shouldUpdate('3.0.0', '2.0.0', '1.2.3')).toBe(true)
  })

  it('handles v-prefix in pinned version', () => {
    expect(shouldUpdate('1.2.3', '2.0.0', 'v1.2.3')).toBe(false)
  })

  it('ignores server version when pinned version is set', () => {
    expect(shouldUpdate('1.2.3', '3.0.0', '1.2.3')).toBe(false)
    expect(shouldUpdate('1.0.0', '3.0.0', '1.2.3')).toBe(true)
  })
})

describe('checkForUpdate error behavior', () => {
  it('throws when version metadata omits version', async () => {
    ;(fetch as Mock).mockResolvedValueOnce(okJson({}))

    await expect(checkForUpdate('https://example.com/version.json', 'https://example.com/bin')).rejects.toThrow()
  })

  it('returns false and does not re-exec when replacing a renamed Windows binary fails', async () => {
    ;(fetch as Mock).mockResolvedValueOnce(okJson({ version: '9.9.9' })).mockResolvedValueOnce(okBinary())
    mockRenameSync
      .mockReturnValueOnce(undefined)
      .mockImplementationOnce(() => {
        throw new Error('replace failed')
      })

    await expect(checkForUpdate('https://example.com/version.json', 'https://example.com/bin')).resolves.toBe(false)

    expect(mockExecFileSync).not.toHaveBeenCalled()
    expect(mockRmSync).toHaveBeenCalledWith('/tmp/glean-mdm-update-test', { force: true, recursive: true })
  })

  it('returns false and does not re-exec when locked Windows pending write fails', async () => {
    ;(fetch as Mock).mockResolvedValueOnce(okJson({ version: '9.9.9' })).mockResolvedValueOnce(okBinary())
    mockRenameSync
      .mockImplementationOnce(() => {
        throw new Error('binary locked')
      })
      .mockImplementationOnce(() => {
        throw new Error('pending rename failed')
      })
    mockCopyFileSync.mockImplementationOnce(() => {
      throw new Error('copy failed')
    })

    await expect(checkForUpdate('https://example.com/version.json', 'https://example.com/bin')).resolves.toBe(false)

    expect(mockExecFileSync).not.toHaveBeenCalled()
    expect(mockRmSync).toHaveBeenCalledWith('/tmp/glean-mdm-update-test', { force: true, recursive: true })
  })
})
