import { createHash, randomUUID } from 'node:crypto'
import { closeSync, linkSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { log } from './logger.js'
import { getRunLockPath } from './platform.js'

export const RUN_LOCK_TOKEN_ENV = 'GLEAN_MDM_RUN_LOCK_TOKEN'

const INCOMPLETE_LOCK_GRACE_MS = 5_000
const MAX_ACQUIRE_ATTEMPTS = 3

interface RunLockOwner {
  createdAt: string
  pid: number
  token: string
}

export interface RunLock {
  owner: RunLockOwner
  release: () => void
}

interface LockIdentity {
  device: number
  inode: number
  modifiedAtMs: number
  size: number
}

type ExistingLock =
  | { kind: 'active-unknown' }
  | { kind: 'missing' }
  | { identity: LockIdentity; kind: 'owner'; owner: RunLockOwner }
  | { identity: LockIdentity; kind: 'stale-unknown' }

type StaleLock = Extract<ExistingLock, { kind: 'owner' | 'stale-unknown' }>
type ReclaimResult = 'busy' | 'reclaimed' | 'retry'

let currentRunLockToken: string | undefined

function getErrorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code
}

function isRunLockOwner(value: unknown): value is RunLockOwner {
  if (typeof value !== 'object' || value === null) return false
  const owner = value as Partial<RunLockOwner>
  return (
    typeof owner.createdAt === 'string' &&
    typeof owner.pid === 'number' &&
    Number.isSafeInteger(owner.pid) &&
    owner.pid > 0 &&
    typeof owner.token === 'string' &&
    owner.token.length > 0
  )
}

function inspectExistingLock(lockPath: string): ExistingLock {
  let raw: string
  try {
    raw = readFileSync(lockPath, 'utf8')
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') return { kind: 'missing' }
    return { kind: 'active-unknown' }
  }

  try {
    const stats = statSync(lockPath)
    const identity = {
      device: stats.dev,
      inode: stats.ino,
      modifiedAtMs: stats.mtimeMs,
      size: stats.size,
    }

    try {
      const owner: unknown = JSON.parse(raw)
      if (isRunLockOwner(owner)) return { identity, kind: 'owner', owner }
    } catch {
      // A process can observe the file between its exclusive creation and metadata write.
    }

    const ageMs = Date.now() - stats.mtimeMs
    return ageMs > INCOMPLETE_LOCK_GRACE_MS
      ? { identity, kind: 'stale-unknown' }
      : { kind: 'active-unknown' }
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') return { kind: 'missing' }
    return { kind: 'active-unknown' }
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return getErrorCode(error) === 'EPERM'
  }
}

function isSameLock(left: StaleLock, right: ExistingLock): boolean {
  if (left.kind !== right.kind || (right.kind !== 'owner' && right.kind !== 'stale-unknown')) return false
  if (
    left.identity.device !== right.identity.device ||
    left.identity.inode !== right.identity.inode ||
    left.identity.modifiedAtMs !== right.identity.modifiedAtMs ||
    left.identity.size !== right.identity.size
  ) {
    return false
  }
  if (left.kind === 'stale-unknown') return right.kind === 'stale-unknown'
  return right.kind === 'owner' && left.owner.token === right.owner.token
}

function getReclaimPath(lockPath: string, lock: StaleLock): string {
  const snapshot =
    lock.kind === 'owner'
      ? `${lock.identity.device}:${lock.identity.inode}:${lock.identity.modifiedAtMs}:${lock.identity.size}:${lock.owner.token}`
      : `${lock.identity.device}:${lock.identity.inode}:${lock.identity.modifiedAtMs}:${lock.identity.size}`
  const digest = createHash('sha256').update(snapshot).digest('hex')
  return `${lockPath}.reclaim-${digest}`
}

function tryReclaimStaleLock(lockPath: string, observed: StaleLock): ReclaimResult {
  const reclaimPath = getReclaimPath(lockPath, observed)
  try {
    // This hard link atomically captures the inode currently at lockPath. A
    // contender may only unlink the canonical path while it owns this claim.
    linkSync(lockPath, reclaimPath)
  } catch (error) {
    const code = getErrorCode(error)
    if (code === 'ENOENT') return 'retry'
    if (code !== 'EEXIST') log.warn(`Could not claim stale run lock ${lockPath}: ${error}`)
    return 'busy'
  }

  try {
    const claimed = inspectExistingLock(reclaimPath)
    // A late contender may have linked a replacement lock under the old claim
    // name. Only the exact stale inode observed above may be removed.
    if (!isSameLock(observed, claimed)) return 'busy'

    try {
      unlinkSync(lockPath)
      return 'reclaimed'
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') return 'retry'
      log.warn(`Could not remove stale run lock ${lockPath}: ${error}`)
      return 'busy'
    }
  } finally {
    try {
      unlinkSync(reclaimPath)
    } catch {
      // Best effort cleanup. A leftover claim makes future contenders no-op.
    }
  }
}

function createRunLock(lockPath: string, owner: RunLockOwner, removeOnRelease = true): RunLock {
  let released = false

  function release(): void {
    if (released) return
    released = true
    process.off('exit', release)

    if (removeOnRelease) {
      const existing = inspectExistingLock(lockPath)
      if (existing.kind === 'owner' && existing.owner.token === owner.token) {
        try {
          unlinkSync(lockPath)
        } catch (error) {
          if (getErrorCode(error) !== 'ENOENT') {
            log.warn(`Could not release run lock ${lockPath}: ${error}`)
          }
        }
      }
    }

    if (currentRunLockToken === owner.token) {
      currentRunLockToken = undefined
    }
  }

  process.once('exit', release)
  return { owner, release }
}

function createLockFile(lockPath: string): RunLock {
  const owner: RunLockOwner = {
    createdAt: new Date().toISOString(),
    pid: process.pid,
    token: randomUUID(),
  }

  const fileDescriptor = openSync(lockPath, 'wx', 0o600)
  try {
    writeFileSync(fileDescriptor, JSON.stringify(owner) + '\n', 'utf8')
  } catch (error) {
    closeSync(fileDescriptor)
    try {
      unlinkSync(lockPath)
    } catch {
      // Best effort cleanup of a partially initialized lock.
    }
    throw error
  }

  closeSync(fileDescriptor)
  currentRunLockToken = owner.token
  return createRunLock(lockPath, owner)
}

export function tryAcquireRunLock(lockPath = getRunLockPath()): RunLock | null {
  mkdirSync(dirname(lockPath), { recursive: true })

  const inheritedToken = process.env[RUN_LOCK_TOKEN_ENV]
  delete process.env[RUN_LOCK_TOKEN_ENV]
  if (inheritedToken) {
    const existing = inspectExistingLock(lockPath)
    if (existing.kind === 'owner' && existing.owner.token === inheritedToken) {
      currentRunLockToken = inheritedToken
      // The updating parent remains the owner. Keeping its lock file in place
      // also protects the parent's fallback work if the child exits non-zero.
      return createRunLock(lockPath, existing.owner, false)
    }
  }

  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
    try {
      return createLockFile(lockPath)
    } catch (error) {
      if (getErrorCode(error) !== 'EEXIST') throw error
    }

    const existing = inspectExistingLock(lockPath)
    if (existing.kind === 'missing') continue

    if (existing.kind === 'owner' && isProcessRunning(existing.owner.pid)) {
      log.info(`Another glean-mdm run is already in progress (pid ${existing.owner.pid}); skipping`)
      return null
    }

    if (existing.kind === 'active-unknown') {
      log.info('Another glean-mdm run is already in progress; skipping')
      return null
    }

    const reclaimResult = tryReclaimStaleLock(lockPath, existing)
    if (reclaimResult === 'retry') continue
    if (reclaimResult === 'busy') {
      log.info('Another glean-mdm run is already in progress; skipping')
      return null
    }

    log.warn(`Removed stale run lock ${lockPath}`)
  }

  log.info('Another glean-mdm run is already in progress; skipping')
  return null
}

export function getRunLockChildEnv(): NodeJS.ProcessEnv {
  if (!currentRunLockToken) return process.env
  return { ...process.env, [RUN_LOCK_TOKEN_ENV]: currentRunLockToken }
}

export async function withRunLock(run: () => Promise<void>, lockPath = getRunLockPath()): Promise<boolean> {
  const lock = tryAcquireRunLock(lockPath)
  if (!lock) return false

  try {
    await run()
    return true
  } finally {
    lock.release()
  }
}
