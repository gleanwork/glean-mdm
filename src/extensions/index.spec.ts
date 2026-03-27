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

describe('stale dir filtering', () => {
  it('preserves the current version on no-op install', () => {
    // User already has v1.0.0, CLI returns success without changes
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'glean.glean-1.0.0'))

    const oldDirs = new Set(findOldExtensionDirs(extensionsDir))
    // No-op install: nothing changes on disk
    const currentDirs = new Set(findOldExtensionDirs(extensionsDir))
    const newDirs = [...currentDirs].filter((d) => !oldDirs.has(d))

    if (newDirs.length > 0) {
      const staleDirs = [...oldDirs].filter((d) => currentDirs.has(d))
      removeExtensionDirs(staleDirs)
    }

    const remaining = readdirSync(extensionsDir)
    expect(remaining).toEqual(['glean.glean-1.0.0'])
  })

  it('removes old version when upgrade adds a new version dir', () => {
    // Before install: v1.0.0, after install: v1.0.0 + v2.0.0 (CLI didn't clean up)
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'glean.glean-1.0.0'))

    const oldDirs = new Set(findOldExtensionDirs(extensionsDir))

    // Simulate upgrade: CLI adds new version but doesn't remove old
    mkdirSync(join(extensionsDir, 'glean.glean-2.0.0'))

    const currentDirs = new Set(findOldExtensionDirs(extensionsDir))
    const newDirs = [...currentDirs].filter((d) => !oldDirs.has(d))

    if (newDirs.length > 0) {
      const staleDirs = [...oldDirs].filter((d) => currentDirs.has(d))
      removeExtensionDirs(staleDirs)
    }

    const remaining = readdirSync(extensionsDir)
    expect(remaining).toEqual(['glean.glean-2.0.0'])
  })

  it('handles upgrade where CLI already cleaned old version', () => {
    // Before install: v1.0.0, after install: only v2.0.0 (CLI cleaned up)
    const extensionsDir = join(tempDir, 'extensions')
    mkdirSync(extensionsDir)
    mkdirSync(join(extensionsDir, 'glean.glean-1.0.0'))

    const oldDirs = new Set(findOldExtensionDirs(extensionsDir))

    // Simulate upgrade: CLI removes old and adds new
    const { rmSync } = require('node:fs')
    rmSync(join(extensionsDir, 'glean.glean-1.0.0'), { recursive: true })
    mkdirSync(join(extensionsDir, 'glean.glean-2.0.0'))

    const currentDirs = new Set(findOldExtensionDirs(extensionsDir))
    const newDirs = [...currentDirs].filter((d) => !oldDirs.has(d))

    if (newDirs.length > 0) {
      const staleDirs = [...oldDirs].filter((d) => currentDirs.has(d))
      removeExtensionDirs(staleDirs)
    }

    const remaining = readdirSync(extensionsDir)
    expect(remaining).toEqual(['glean.glean-2.0.0'])
  })
})
