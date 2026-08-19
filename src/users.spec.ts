import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, it, expect } from 'vitest'

import { hasUsableHomeDir } from './users'

const tempDir = mkdtempSync(join(tmpdir(), 'glean-mdm-users-'))

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('hasUsableHomeDir', () => {
  it('accepts a real directory', () => {
    expect(hasUsableHomeDir(tempDir)).toBe(true)
  })

  it('rejects /dev/null, the placeholder home macOS gives service accounts', () => {
    expect(hasUsableHomeDir('/dev/null')).toBe(false)
  })

  it('rejects a path that does not exist', () => {
    expect(hasUsableHomeDir(join(tempDir, 'no-such-home'))).toBe(false)
  })

  it('rejects a path that exists but is a file', () => {
    const filePath = join(tempDir, 'not-a-dir')
    writeFileSync(filePath, '')

    expect(hasUsableHomeDir(filePath)).toBe(false)
  })

  it('rejects an empty home directory value', () => {
    expect(hasUsableHomeDir('')).toBe(false)
  })
})
