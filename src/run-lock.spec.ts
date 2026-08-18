import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getRunLockChildEnv,
  RUN_LOCK_TOKEN_ENV,
  tryAcquireRunLock,
  type RunLock,
  withRunLock,
} from './run-lock'

let tempDir: string
let lockPath: string
let locks: RunLock[]

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'glean-mdm-run-lock-test-'))
  lockPath = join(tempDir, 'run.lock')
  locks = []
})

afterEach(() => {
  for (const lock of locks.reverse()) lock.release()
  delete process.env[RUN_LOCK_TOKEN_ENV]
  rmSync(tempDir, { force: true, recursive: true })
})

function acquire(): RunLock {
  const lock = tryAcquireRunLock(lockPath)
  expect(lock).not.toBeNull()
  locks.push(lock!)
  return lock!
}

describe('withRunLock', () => {
  it('runs work while holding the lock and removes it afterward', async () => {
    const work = vi.fn(async () => {
      expect(existsSync(lockPath)).toBe(true)
    })

    await expect(withRunLock(work, lockPath)).resolves.toBe(true)

    expect(work).toHaveBeenCalledOnce()
    expect(existsSync(lockPath)).toBe(false)
  })

  it('no-ops successfully when another run holds the lock', async () => {
    acquire()
    const work = vi.fn(async () => {})

    await expect(withRunLock(work, lockPath)).resolves.toBe(false)

    expect(work).not.toHaveBeenCalled()
  })

  it('releases the lock when work throws', async () => {
    const error = new Error('run failed')

    await expect(
      withRunLock(async () => {
        throw error
      }, lockPath),
    ).rejects.toThrow(error)

    expect(existsSync(lockPath)).toBe(false)
    acquire()
  })
})

describe('tryAcquireRunLock', () => {
  it('replaces a stale lock whose process is no longer running', () => {
    writeFileSync(
      lockPath,
      JSON.stringify({
        createdAt: '2020-01-01T00:00:00.000Z',
        pid: 2_000_000_000,
        token: 'stale-token',
      }),
    )

    const lock = acquire()

    expect(lock.owner.token).not.toBe('stale-token')
  })

  it('does not remove an incomplete lock that was just created', () => {
    writeFileSync(lockPath, '')

    expect(tryAcquireRunLock(lockPath)).toBeNull()
    expect(existsSync(lockPath)).toBe(true)
  })

  it('replaces an abandoned incomplete lock after the grace period', () => {
    writeFileSync(lockPath, '')
    const oldTimestamp = new Date(Date.now() - 10_000)
    utimesSync(lockPath, oldTimestamp, oldTimestamp)

    acquire()
  })

  it('lets a self-update child inherit the current lock', () => {
    const parentLock = acquire()
    const childEnv = getRunLockChildEnv()
    process.env[RUN_LOCK_TOKEN_ENV] = childEnv[RUN_LOCK_TOKEN_ENV]

    const inheritedLock = tryAcquireRunLock(lockPath)

    expect(inheritedLock).not.toBeNull()
    expect(inheritedLock!.owner.token).toBe(parentLock.owner.token)
    expect(process.env[RUN_LOCK_TOKEN_ENV]).toBeUndefined()
    locks.push(inheritedLock!)

    inheritedLock!.release()
    expect(existsSync(lockPath)).toBe(true)
    parentLock.release()
    expect(existsSync(lockPath)).toBe(false)
  })
})
