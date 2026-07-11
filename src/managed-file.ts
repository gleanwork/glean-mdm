import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  fchmodSync,
  fchownSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  type Stats,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_FILE_MODE = 0o600
const INVALID_LOCK_STALE_MS = 10 * 60 * 1000

interface LockData {
  createdAt: number
  pid: number
  token: string
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

export function resolveWritePath(filePath: string): string {
  let file: ReturnType<typeof lstatSync>
  try {
    file = lstatSync(filePath)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return filePath
    }
    throw error
  }
  return file.isSymbolicLink() ? realpathSync(filePath) : filePath
}

export function readTextFileIfExists(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return undefined
    }
    throw error
  }
}

function readLock(lockPath: string): LockData | undefined {
  try {
    const value = JSON.parse(readFileSync(lockPath, 'utf-8')) as Partial<LockData>
    if (
      typeof value.createdAt === 'number' &&
      typeof value.pid === 'number' &&
      typeof value.token === 'string'
    ) {
      return value as LockData
    }
  } catch {
    return undefined
  }
  return undefined
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !hasErrorCode(error, 'ESRCH')
  }
}

function removeStaleLock(lockPath: string): boolean {
  const lock = readLock(lockPath)
  if (lock) {
    if (isProcessAlive(lock.pid)) {
      return false
    }
  } else {
    try {
      const age = Date.now() - statSync(lockPath).mtimeMs
      if (age < INVALID_LOCK_STALE_MS) {
        return false
      }
    } catch (error) {
      return hasErrorCode(error, 'ENOENT')
    }
  }

  try {
    unlinkSync(lockPath)
    return true
  } catch (error) {
    return hasErrorCode(error, 'ENOENT')
  }
}

export function withFileLock<T>(filePath: string, operation: () => T): T {
  const directory = dirname(filePath)
  mkdirSync(directory, { recursive: true })

  const lockPath = join(directory, `.${basename(filePath)}.glean-mdm.lock`)
  const lock: LockData = {
    createdAt: Date.now(),
    pid: process.pid,
    token: randomUUID(),
  }

  let lockFd: number
  try {
    lockFd = openSync(lockPath, 'wx', DEFAULT_FILE_MODE)
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST') || !removeStaleLock(lockPath)) {
      throw new Error(`Configuration file is already being modified: ${filePath}`, { cause: error })
    }
    lockFd = openSync(lockPath, 'wx', DEFAULT_FILE_MODE)
  }

  try {
    try {
      writeFileSync(lockFd, JSON.stringify(lock))
      fsyncSync(lockFd)
    } catch (error) {
      try {
        unlinkSync(lockPath)
      } catch {
        // The original initialization failure is more useful to the caller.
      }
      throw error
    }
  } finally {
    closeSync(lockFd)
  }

  try {
    return operation()
  } finally {
    if (readLock(lockPath)?.token === lock.token) {
      try {
        unlinkSync(lockPath)
      } catch (error) {
        if (!hasErrorCode(error, 'ENOENT')) {
          throw error
        }
      }
    }
  }
}

function preserveWindowsAcl(sourcePath: string, targetPath: string): void {
  const escape = (value: string) => value.replace(/'/g, "''")
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$acl = Get-Acl -LiteralPath '${escape(sourcePath)}' -ErrorAction Stop; Set-Acl -LiteralPath '${escape(targetPath)}' -AclObject $acl -ErrorAction Stop`,
    ],
    { stdio: 'pipe', timeout: 30_000 },
  )
}

export function atomicWriteFile(filePath: string, content: string): void {
  let existing: Stats | undefined
  try {
    existing = statSync(filePath)
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) {
      throw error
    }
  }

  const directory = dirname(filePath)
  mkdirSync(directory, { recursive: true })

  const mode = existing ? existing.mode & 0o7777 : DEFAULT_FILE_MODE
  const tempPath = join(directory, `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`)
  let tempFd: number | undefined

  try {
    tempFd = openSync(tempPath, 'wx', mode)
    writeFileSync(tempFd, content, 'utf-8')

    if (existing && process.platform !== 'win32') {
      const currentUid = process.getuid?.()
      const currentGid = process.getgid?.()
      if (existing.uid !== currentUid || existing.gid !== currentGid) {
        fchownSync(tempFd, existing.uid, existing.gid)
      }
      fchmodSync(tempFd, mode)
    }

    fsyncSync(tempFd)
    closeSync(tempFd)
    tempFd = undefined

    if (existing && process.platform === 'win32') {
      preserveWindowsAcl(filePath, tempPath)
    }

    renameSync(tempPath, filePath)
  } finally {
    if (tempFd !== undefined) {
      closeSync(tempFd)
    }
    try {
      unlinkSync(tempPath)
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        throw error
      }
    }
  }
}
