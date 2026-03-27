import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, beforeEach } from 'vitest'

import { findEditorCli, findOldExtensionDirs, removeExtensionDirs } from './index'

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
    const result = findEditorCli('test-editor', [process.execPath, '/usr/bin/env'], 'darwin')
    expect(result).toBe(process.execPath)
  })

  it('returns null when no candidates exist and editor is not on PATH', () => {
    const result = findEditorCli('nonexistent-editor-xyz-12345', ['/no/such/path'], 'darwin')
    expect(result).toBeNull()
  })
})

describe('findOldExtensionDirs', () => {
  it('returns paths matching glean.glean-*', () => {
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'glean.glean-1.0.0'))
    mkdirSync(join(extensionsDir, 'glean.glean-2.0.0'))
    mkdirSync(join(extensionsDir, 'other.extension-1.0.0'))

    const dirs = findOldExtensionDirs(extensionsDir)
    expect(dirs).toHaveLength(2)
    expect(dirs).toContain(join(extensionsDir, 'glean.glean-1.0.0'))
    expect(dirs).toContain(join(extensionsDir, 'glean.glean-2.0.0'))
  })

  it('returns empty array when extensions directory does not exist', () => {
    const dirs = findOldExtensionDirs(join(tempDir, 'nonexistent'))
    expect(dirs).toEqual([])
  })

  it('returns empty array when no matching extensions exist', () => {
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'some.other-1.0.0'))

    const dirs = findOldExtensionDirs(extensionsDir)
    expect(dirs).toEqual([])
  })
})

describe('removeExtensionDirs', () => {
  it('removes the specified directories', () => {
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'glean.glean-1.0.0'))
    mkdirSync(join(extensionsDir, 'glean.glean-2.0.0'))
    mkdirSync(join(extensionsDir, 'other.extension-1.0.0'))

    removeExtensionDirs([
      join(extensionsDir, 'glean.glean-1.0.0'),
      join(extensionsDir, 'glean.glean-2.0.0'),
    ])

    const remaining = readdirSync(extensionsDir)
    expect(remaining).toEqual(['other.extension-1.0.0'])
  })

  it('handles already-removed directories gracefully', () => {
    expect(() => removeExtensionDirs([join(tempDir, 'nonexistent')])).not.toThrow()
  })
})
