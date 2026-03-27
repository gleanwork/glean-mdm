import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, beforeEach } from 'vitest'

import { cleanOldExtensions, findEditorCli } from './index'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mdm-ext-test-'))
})

describe('findEditorCli', () => {
  it('returns the first candidate that exists', () => {
    const result = findEditorCli('test-editor', ['/nonexistent/path', process.execPath], 'darwin')
    expect(result).toBe(process.execPath)
  })

  it('prefers earlier candidates over later ones', () => {
    // Both exist, should return the first
    const result = findEditorCli('test-editor', [process.execPath, '/usr/bin/env'], 'darwin')
    expect(result).toBe(process.execPath)
  })

  it('returns null when no candidates exist and editor is not on PATH', () => {
    const result = findEditorCli('nonexistent-editor-xyz-12345', ['/no/such/path'], 'darwin')
    expect(result).toBeNull()
  })
})

describe('cleanOldExtensions', () => {
  it('removes directories matching glean.glean-*', () => {
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'glean.glean-1.0.0'))
    mkdirSync(join(extensionsDir, 'glean.glean-2.0.0'))
    mkdirSync(join(extensionsDir, 'other.extension-1.0.0'))

    cleanOldExtensions(extensionsDir)

    const remaining = readdirSync(extensionsDir)
    expect(remaining).toEqual(['other.extension-1.0.0'])
  })

  it('does nothing when extensions directory does not exist', () => {
    expect(() => cleanOldExtensions(join(tempDir, 'nonexistent'))).not.toThrow()
  })

  it('does nothing when no matching extensions exist', () => {
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'some.other-1.0.0'))

    cleanOldExtensions(extensionsDir)

    const remaining = readdirSync(extensionsDir)
    expect(remaining).toEqual(['some.other-1.0.0'])
  })
})
