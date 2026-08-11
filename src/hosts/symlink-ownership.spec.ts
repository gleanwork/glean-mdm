import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveUserOwnedWritePath } from './index.js'

describe('resolveUserOwnedWritePath', () => {
  it('returns the target of a symlink when the target is within the user home', () => {
    const userHomeDir = mkdtempSync(join(tmpdir(), 'mdm-user-home-'))
    const targetDir = join(userHomeDir, 'Code', 'dotfiles', 'claude')
    const targetPath = join(targetDir, '.claude.json')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(targetPath, '{}')

    const symlinkPath = join(userHomeDir, '.claude.json')
    symlinkSync(targetPath, symlinkPath)

    expect(resolveUserOwnedWritePath(symlinkPath, userHomeDir)).toBe(realpathSync(targetPath))
  })

  it('returns a regular config path within the user home', () => {
    const userHomeDir = mkdtempSync(join(tmpdir(), 'mdm-user-home-'))
    const configPath = join(userHomeDir, '.claude.json')
    writeFileSync(configPath, '{}')

    expect(resolveUserOwnedWritePath(configPath, userHomeDir)).toBe(realpathSync(configPath))
  })

  it('does not return a symlink target outside the user home', () => {
    const userHomeDir = mkdtempSync(join(tmpdir(), 'mdm-user-home-'))
    const targetDir = mkdtempSync(join(tmpdir(), 'mdm-shared-config-'))
    const targetPath = join(targetDir, '.claude.json')
    writeFileSync(targetPath, '{}')

    const symlinkPath = join(userHomeDir, '.claude.json')
    symlinkSync(targetPath, symlinkPath)

    expect(resolveUserOwnedWritePath(symlinkPath, userHomeDir)).toBeNull()
  })
})
