import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { atomicWriteFile, resolveWritePath, withFileLock } from './managed-file'

describe('managed file operations', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'managed-file-test-'))
  })

  it('creates new files with owner-only permissions', () => {
    const filePath = join(tempDir, 'config.json')

    atomicWriteFile(filePath, '{}\n')

    expect(readFileSync(filePath, 'utf-8')).toBe('{}\n')
    if (process.platform !== 'win32') {
      expect(statSync(filePath).mode & 0o777).toBe(0o600)
    }
  })

  it('preserves the mode of an existing file', () => {
    if (process.platform === 'win32') return

    const filePath = join(tempDir, 'config.json')
    writeFileSync(filePath, 'old')
    chmodSync(filePath, 0o640)

    atomicWriteFile(filePath, 'new')

    expect(readFileSync(filePath, 'utf-8')).toBe('new')
    expect(statSync(filePath).mode & 0o777).toBe(0o640)
  })

  it('uses unique temporary files and cleans them after replacement', () => {
    const filePath = join(tempDir, 'config.json')

    atomicWriteFile(filePath, 'first')
    atomicWriteFile(filePath, 'second')

    expect(readFileSync(filePath, 'utf-8')).toBe('second')
    expect(readdirSync(tempDir)).toEqual(['config.json'])
  })

  it('rejects overlapping mutations and releases the lock afterward', () => {
    const filePath = join(tempDir, 'config.json')

    withFileLock(filePath, () => {
      expect(() => withFileLock(filePath, () => undefined)).toThrow(/already being modified/)
    })

    expect(() => withFileLock(filePath, () => undefined)).not.toThrow()
    expect(readdirSync(tempDir)).toEqual([])
  })

  it('rejects dangling symlinks instead of replacing them', () => {
    const filePath = join(tempDir, 'config.json')
    symlinkSync(join(tempDir, 'missing.json'), filePath)

    expect(() => resolveWritePath(filePath)).toThrow()
    expect(lstatSync(filePath).isSymbolicLink()).toBe(true)
  })
})
