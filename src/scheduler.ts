import { execFileSync, execSync } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'

import { log } from './logger.js'
import { getBinaryInstallPath, getPlatform } from './platform.js'

const MACOS_PLIST_PATH = '/Library/LaunchDaemons/com.glean.mdm.plist'
const LINUX_SERVICE_PATH = '/etc/systemd/system/glean-mdm.service'
const LINUX_TIMER_PATH = '/etc/systemd/system/glean-mdm.timer'
const WINDOWS_TASK_NAME = 'Glean MDM'

/** Random minute (0–59) to stagger scheduled runs and avoid thundering-herd on the version endpoint. */
export function randomMinute(): number {
  return Math.floor(Math.random() * 60)
}

/** Exposed for tests — argv array avoids shell quoting bugs when paths contain spaces. */
export function schtasksCreateArgs(binaryPath: string, minute: number): string[] {
  const startTime = `09:${String(minute).padStart(2, '0')}`
  return ['/Create', '/TN', WINDOWS_TASK_NAME, '/TR', `${binaryPath} setup`, '/SC', 'DAILY', '/ST', startTime, '/RU', 'SYSTEM', '/F']
}

function installMacOSSchedule(): void {
  const binaryPath = getBinaryInstallPath()
  const minute = randomMinute()
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.glean.mdm</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binaryPath}</string>
        <string>setup</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>${minute}</integer>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/glean-mdm.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/glean-mdm.log</string>
</dict>
</plist>`

  writeFileSync(MACOS_PLIST_PATH, plist)
  try {
    execSync(`launchctl bootout system "${MACOS_PLIST_PATH}"`, { stdio: 'ignore' })
  } catch {
    // May not be loaded
  }
  execSync(`launchctl bootstrap system "${MACOS_PLIST_PATH}"`)
  log.info('Installed macOS LaunchDaemon schedule')
}

function uninstallMacOSSchedule(): void {
  try {
    execSync(`launchctl bootout system "${MACOS_PLIST_PATH}"`, { stdio: 'ignore' })
  } catch {
    // May not be loaded
  }
  try {
    unlinkSync(MACOS_PLIST_PATH)
  } catch {
    // May not exist
  }
  log.info('Removed macOS LaunchDaemon schedule')
}

function installLinuxSchedule(): void {
  const binaryPath = getBinaryInstallPath()

  const service = `[Unit]
Description=Glean MDM
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${binaryPath} setup

[Install]
WantedBy=multi-user.target
`

  const minute = randomMinute()
  const timer = `[Unit]
Description=Daily Glean MDM

[Timer]
OnCalendar=*-*-* 09:${String(minute).padStart(2, '0')}:00
Persistent=true

[Install]
WantedBy=timers.target
`

  writeFileSync(LINUX_SERVICE_PATH, service)
  writeFileSync(LINUX_TIMER_PATH, timer)
  execSync('systemctl daemon-reload')
  execSync('systemctl enable --now glean-mdm.timer')
  log.info('Installed systemd timer schedule')
}

function uninstallLinuxSchedule(): void {
  try {
    execSync('systemctl disable --now glean-mdm.timer', {
      stdio: 'ignore',
    })
  } catch {
    // May not be enabled
  }
  try {
    unlinkSync(LINUX_SERVICE_PATH)
  } catch {
    // May not exist
  }
  try {
    unlinkSync(LINUX_TIMER_PATH)
  } catch {
    // May not exist
  }
  try {
    execSync('systemctl daemon-reload', { stdio: 'ignore' })
  } catch {
    // Best effort
  }
  log.info('Removed systemd timer schedule')
}

function installWindowsSchedule(): void {
  const binaryPath = getBinaryInstallPath()
  const minute = randomMinute()
  execFileSync('schtasks', schtasksCreateArgs(binaryPath, minute))
  // Enable catch-up: run the task if a scheduled run was missed while the machine was off
  execSync(
    `powershell -Command "$t = Get-ScheduledTask '${WINDOWS_TASK_NAME}'; $t.Settings.StartWhenAvailable = $true; $t | Set-ScheduledTask"`,
  )
  log.info('Installed Windows Task Scheduler schedule')
}

function uninstallWindowsSchedule(): void {
  try {
    execSync(`schtasks /Delete /TN "${WINDOWS_TASK_NAME}" /F`, {
      stdio: 'ignore',
    })
  } catch {
    // May not exist
  }
  log.info('Removed Windows Task Scheduler schedule')
}

export function installSchedule(): void {
  switch (getPlatform()) {
    case 'darwin':
      installMacOSSchedule()
      break
    case 'linux':
      installLinuxSchedule()
      break
    case 'win32':
      installWindowsSchedule()
      break
  }
}

export function uninstallSchedule(): void {
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
