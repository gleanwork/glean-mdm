import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { log } from './logger.js'
import { getBinaryInstallPath, getPlatform, getTargetName } from './platform.js'
import { BUILD_VERSION } from './version.js'

interface VersionInfo {
  checksums: Record<string, string>
  version: string
}

const VERSION_PREFIX = /^v/

export function compareVersions(a: string, b: string): number {
  const partsA = a.replace(VERSION_PREFIX, '').split('.').map(Number)
  const partsB = b.replace(VERSION_PREFIX, '').split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export async function checkForUpdate(backendUrl: string): Promise<boolean> {
  const target = getTargetName()
  const currentPlatform = getPlatform()

  log.info(`Checking for updates (current: ${BUILD_VERSION})`)

  let versionInfo: VersionInfo
  const versionUrl = `${backendUrl}/api/v1/mdm/version`
  log.info(`Fetching version info from ${versionUrl}`)
  try {
    const response = await fetch(versionUrl)
    if (!response.ok) {
      const body = await response.text().catch(() => '<no body>')
      log.warn(`Update check returned HTTP ${response.status}: ${body}`)
      return false
    }
    versionInfo = (await response.json()) as VersionInfo
  } catch (err) {
    log.warn(`Update check failed: ${err}`)
    log.warn(`Continuing with current version: ${BUILD_VERSION}`)
    return false
  }

  if (compareVersions(BUILD_VERSION, versionInfo.version) >= 0) {
    log.info(`Already up to date (${BUILD_VERSION})`)
    return false
  }

  log.info(`Update available: ${BUILD_VERSION} → ${versionInfo.version}`)

  const expectedChecksum = versionInfo.checksums[target]
  if (!expectedChecksum) {
    log.error(`No checksum for target ${target}`)
    return false
  }

  const binaryPath = getBinaryInstallPath()
  const tmpDir = mkdtempSync(join(dirname(binaryPath), '.glean-mdm-update-'))
  const tmpPath = join(tmpDir, 'binary')

  try {
    const response = await fetch(`${backendUrl}/api/v1/mdm/binary?target=${target}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    writeFileSync(tmpPath, buffer, { mode: 0o600 })

    const actualChecksum = `sha256:${createHash('sha256').update(buffer).digest('hex')}`

    if (actualChecksum !== expectedChecksum) {
      log.error(`Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`)
      rmSync(tmpDir, { force: true, recursive: true })
      return false
    }

    if (currentPlatform === 'win32') {
      const oldPath = `${binaryPath}.old`
      let renamed = false
      try {
        renameSync(binaryPath, oldPath)
        renamed = true
      } catch {
        // Binary may not exist (first install) or may be locked
      }

      if (renamed) {
        renameSync(tmpPath, binaryPath)
        try {
          unlinkSync(oldPath)
        } catch {
          // Best effort cleanup
        }
      } else {
        try {
          copyFileSync(tmpPath, binaryPath)
        } catch {
          const pendingPath = `${binaryPath}.pending`
          log.warn(`Binary is locked, writing update to ${pendingPath}`)
          renameSync(tmpPath, pendingPath)
        }
      }
    } else {
      chmodSync(tmpPath, 0o755)
      renameSync(tmpPath, binaryPath)
      if (currentPlatform === 'darwin') {
        try {
          execFileSync('xattr', ['-d', 'com.apple.quarantine', binaryPath], {
            stdio: 'ignore',
          })
        } catch {
          // Quarantine attribute may not exist
        }
      }
    }

    log.info(`Updated to ${versionInfo.version}, re-executing...`)

    const filteredArgs = process.argv.slice(2).filter((a) => a !== '--skip-update')
    execFileSync(binaryPath, [...filteredArgs, '--skip-update'], {
      stdio: 'inherit',
    })
    process.exit(0)
  } catch (err) {
    log.error(`Update failed: ${err}`)
    try {
      rmSync(tmpDir, { force: true, recursive: true })
    } catch {
      // Best effort cleanup
    }
    return false
  }
}
