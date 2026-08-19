import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, it, expect } from 'vitest'

import { hasUsableHomeDir, withUsableHomeDirs } from './users'

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

  it('rejects /var/empty even though it is a real directory', () => {
    expect(hasUsableHomeDir('/var/empty')).toBe(false)
    expect(hasUsableHomeDir('/private/var/empty')).toBe(false)
  })

  it('rejects /nonexistent', () => {
    expect(hasUsableHomeDir('/nonexistent')).toBe(false)
  })

  it('accepts a real home under /private/var, which some MDM admin accounts use', () => {
    const adminHome = join(tempDir, 'private', 'var', 'phd-itadmin')
    mkdirSync(adminHome, { recursive: true })

    expect(hasUsableHomeDir(adminHome)).toBe(true)
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

describe('withUsableHomeDirs', () => {
  it('keeps real users and drops service accounts with placeholder homes', () => {
    const users = withUsableHomeDirs([
      { gid: 20, homeDir: tempDir, uid: 501, username: 'petermurphy' },
      { gid: 555, homeDir: '/dev/null', uid: 555, username: '_sophos' },
      { gid: 556, homeDir: '/var/empty', uid: 556, username: '_daemonish' },
      { gid: 557, homeDir: '/nonexistent', uid: 557, username: '_installer' },
    ])

    expect(users.map((user) => user.username)).toEqual(['petermurphy'])
  })

  it('keeps a Windows-style home passed through without uid or gid', () => {
    const users = withUsableHomeDirs([{ homeDir: tempDir, username: 'winuser' }])

    expect(users.map((user) => user.username)).toEqual(['winuser'])
  })
})
