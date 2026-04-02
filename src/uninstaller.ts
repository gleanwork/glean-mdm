import { spawn } from 'node:child_process'
import { rmSync, unlinkSync } from 'node:fs'

import { log } from './logger.js'
import { getBinaryInstallPath, getDefaultConfigDir, getLogFilePath, getPlatform } from './platform.js'
import { uninstallSchedule } from './scheduler.js'

export interface UninstallOptions {
  keepConfig?: boolean
}

export function fullUninstall(options: UninstallOptions = {}): void {
  uninstallSchedule()

  const configDir = getDefaultConfigDir()
  if (options.keepConfig) {
    log.info(`Keeping config directory: ${configDir}`)
  } else {
    try {
      rmSync(configDir, { recursive: true, force: true })
      log.info(`Removed config directory: ${configDir}`)
    } catch {
      log.warn(`Could not remove config directory: ${configDir}`)
    }
  }

  const logFile = getLogFilePath()
  try {
    unlinkSync(logFile)
    log.info(`Removed log file: ${logFile}`)
  } catch {
    // May not exist
  }

  const binaryPath = getBinaryInstallPath()
  if (getPlatform() === 'win32') {
    spawn('cmd', ['/c', `ping -n 3 127.0.0.1 > nul & del "${binaryPath}"`], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    log.info(`Binary will be removed shortly: ${binaryPath}`)
  } else {
    try {
      unlinkSync(binaryPath)
      log.info(`Removed binary: ${binaryPath}`)
    } catch {
      log.warn(`Could not remove binary: ${binaryPath}`)
    }
  }

  log.info('Uninstall complete')
}
