import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'

import { log } from './logger.js'
import { getPlatform } from './platform.js'

const MACOS_PLIST_PATH = '/Library/LaunchDaemons/com.glean.mdm.plist'
const MACOS_SERVICE_TARGET = 'system/com.glean.mdm'
const LINUX_SERVICE_PATH = '/etc/systemd/system/glean-mdm.service'
const LINUX_TIMER_PATH = '/etc/systemd/system/glean-mdm.timer'
const WINDOWS_TASK_NAME = 'Glean MDM'

function removeScheduleFile(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    // Absence is success. Permission and I/O errors must fail retirement.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function uninstallMacOSSchedule(): void {
  // bootout can terminate this process and its updating parent when invoked
  // from the LaunchDaemon. Remove its persistent definition BEFORE unloading.
  removeScheduleFile(MACOS_PLIST_PATH)
  log.info('macOS LaunchDaemon definition is absent; unloading the legacy job if loaded')
  try {
    // Use the service target: the plist has already been deleted, and the job
    // can still be loaded even if its plist was missing before this run.
    execFileSync('launchctl', ['bootout', MACOS_SERVICE_TARGET], { stdio: 'pipe' })
  } catch (error) {
    // launchctl returns ESRCH (3) when the job is not loaded.
    if ((error as { status?: number }).status !== 3) throw error
  }
}

function uninstallLinuxSchedule(): void {
  const existed = existsSync(LINUX_SERVICE_PATH) || existsSync(LINUX_TIMER_PATH)
  const state = execFileSync('systemctl', ['show', 'glean-mdm.timer', '--property=LoadState,ActiveState'], {
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim().split('\n')
  const missing = state.includes('LoadState=not-found')
  const inactive = state.includes('ActiveState=inactive')

  if (!existed && missing && inactive) return

  // Stop the timer, not the service that may currently be retiring itself.
  // A timer can remain active after its unit file was removed and reloaded.
  if (missing) {
    if (!inactive) execFileSync('systemctl', ['stop', 'glean-mdm.timer'], { stdio: 'pipe' })
  } else {
    execFileSync('systemctl', ['disable', '--now', 'glean-mdm.timer'], { stdio: 'pipe' })
  }
  removeScheduleFile(LINUX_SERVICE_PATH)
  removeScheduleFile(LINUX_TIMER_PATH)
  execFileSync('systemctl', ['daemon-reload'], { stdio: 'pipe' })
  log.info('Removed systemd timer schedule')
}

function uninstallWindowsSchedule(): void {
  // Query objects instead of parsing localized schtasks errors. An absent task
  // is success, but query/deletion failures must produce a non-zero exit.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$task = Get-ScheduledTask | Where-Object { $_.TaskPath -eq '\\' -and $_.TaskName -eq '${WINDOWS_TASK_NAME}' }`,
    "if ($null -ne $task) { $task | Unregister-ScheduledTask -Confirm:$false; Write-Output 'removed' }",
  ].join('; ')
  const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.trim() === 'removed') log.info('Removed Windows Task Scheduler schedule')
}

export function installSchedule(): void {
  log.warn('glean-mdm is deprecated. install-schedule is a no-op; use glean-helper for new MDM deployments.')
}

export function uninstallSchedule(options: { dryRun?: boolean } = {}): void {
  if (options.dryRun) {
    log.info('[DRY RUN] Would remove the legacy Glean MDM schedule if present; no schedule changes made')
    return
  }

  switch (getPlatform()) {
    case 'darwin':
      uninstallMacOSSchedule()
      break
    case 'linux':
      uninstallLinuxSchedule()
      break
    case 'win32':
      uninstallWindowsSchedule()
      break
  }
}
