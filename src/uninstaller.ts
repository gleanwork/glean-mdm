import { renameSync, rmSync, unlinkSync } from 'node:fs'

import { log } from './logger.js'
import { getBinaryInstallPath, getDefaultConfigDir, getLogFilePath, getPlatform } from './platform.js'
import { uninstallSchedule } from './scheduler.js'

export interface UninstallOptions {
  keepConfig?: boolean
}

export function fullUninstall(options: UninstallOptions = {}): void {
  uninstallSchedule()

  const binaryPath = getBinaryInstallPath()
  if (getPlatform() === 'win32') {
    // Windows locks running executables. Rename first (works on locked
    // files), then best-effort delete — same approach as the updater.
    const oldPath = `${binaryPath}.old`
    try {
      renameSync(binaryPath, oldPath)
      log.info(`Renamed binary to ${oldPath}`)
      try {
        unlinkSync(oldPath)
        log.info(`Removed binary: ${oldPath}`)
      } catch {
        log.warn(`Could not remove ${oldPath} (locked) — it will be cleaned up on next boot or update`)
      }
    } catch {
      log.warn(`Could not remove binary: ${binaryPath}`)
    }
  } else {
    try {
      unlinkSync(binaryPath)
      log.info(`Removed binary: ${binaryPath}`)
    } catch {
      log.warn(`Could not remove binary: ${binaryPath}`)
    }
  }

  log.info('Uninstall complete')

  // Remove config dir and log file last so earlier steps can still write
  // to the log. On Windows the log file lives inside the config dir, so
  // removing the config dir implicitly removes the log file too.
  const configDir = getDefaultConfigDir()
  if (options.keepConfig) {
    log.info(`Keeping config directory: ${configDir}`)
  } else {
    try {
      rmSync(configDir, { recursive: true, force: true })
    } catch {
      // May not exist
    }
  }
  try {
    unlinkSync(getLogFilePath())
  } catch {
    // May not exist, or already removed with config dir on Windows
  }
}
