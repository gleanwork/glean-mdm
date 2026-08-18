import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
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

function countLines(path: string): number {
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

async function waitForLineCount(path: string, count: number): Promise<void> {
  const deadline = Date.now() + 10_000
  while (countLines(path) < count) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${count} contenders`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function runContender(scriptPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', [scriptPath, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Contender exited with code ${code}: ${stderr}`))
    })
  })
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

  it(
    'allows only one concurrent contender to replace a stale lock',
    async () => {
      const contenderCount = 24
      const scriptPath = join(tempDir, 'contender.ts')
      const barrierPath = join(tempDir, 'start')
      const readyPath = join(tempDir, 'ready')
      const winnersPath = join(tempDir, 'winners')
      const runLockUrl = new URL('./run-lock.ts', import.meta.url).href

      writeFileSync(
        scriptPath,
        `import { appendFileSync, existsSync } from 'node:fs'
const { withRunLock } = await import(${JSON.stringify(runLockUrl)})
const [lockPath, barrierPath, readyPath, winnersPath] = process.argv.slice(2)
appendFileSync(readyPath, process.pid + '\\n')
while (!existsSync(barrierPath)) await Bun.sleep(1)
await withRunLock(async () => {
  appendFileSync(winnersPath, process.pid + '\\n')
  await Bun.sleep(1_000)
}, lockPath)
`,
      )
      writeFileSync(
        lockPath,
        JSON.stringify({
          createdAt: '2020-01-01T00:00:00.000Z',
          pid: 2_000_000_000,
          token: 'stale-token',
        }),
      )

      const contenders = Array.from({ length: contenderCount }, () =>
        runContender(scriptPath, [lockPath, barrierPath, readyPath, winnersPath]),
      )

      let readinessError: unknown
      try {
        await waitForLineCount(readyPath, contenderCount)
      } catch (error) {
        readinessError = error
      } finally {
        writeFileSync(barrierPath, '')
      }
      await Promise.all(contenders)
      if (readinessError) throw readinessError

      expect(countLines(winnersPath)).toBe(1)
    },
    30_000,
  )

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
