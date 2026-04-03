import { execSync } from 'node:child_process'

import { log } from './logger.js'
import { getPlatform } from './platform.js'

/**
 * Check if the current process has administrator privileges.
 *
 * On Windows: Uses `net session` command (admin-only) to detect elevation.
 * On macOS/Linux: Checks if effective user ID is 0 (root).
 *
 * @returns true if running with admin privileges, false otherwise
 */
export function checkAdminPrivileges(): boolean {
  const platform = getPlatform()

  if (platform === 'win32') {
    // On Windows, use `net session` to detect admin privileges
    // This command requires admin and will fail with exit code != 0 if not elevated
    try {
      execSync('net session', {
        stdio: 'ignore', // Suppress output
        windowsHide: true, // Hide console window
      })
      return true
    } catch {
      return false
    }
  } else {
    // On Unix, check if running as root (effective UID is 0)
    // geteuid() returns 0 when running with sudo or as root user
    return process.geteuid?.() === 0
  }
}

/**
 * Check if the current process has administrator privileges.
 * If not, log an error message and exit with code 1.
 *
 * @param command - The command name to include in the error message
 */
export function requireAdminPrivileges(command: string): void {
  if (!checkAdminPrivileges()) {
    const platform = getPlatform()
    log.error(`Error: The '${command}' command requires administrator privileges.`)

    if (platform === 'win32') {
      log.error('Please run this command from an elevated PowerShell or Command Prompt.')
    } else {
      log.error('Please run this command with sudo (e.g., sudo glean-mdm run).')
    }

    process.exit(1)
  }
}
