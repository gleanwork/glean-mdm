import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { log } from './logger'
import { getPlatform } from './platform'
import { installSchedule, uninstallSchedule } from './scheduler'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(), unlinkSync: vi.fn() }))
vi.mock('./platform', () => ({ getPlatform: vi.fn() }))
vi.mock('./logger', () => ({ log: { info: vi.fn(), warn: vi.fn() } }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(execFileSync).mockReturnValue('')
  vi.mocked(existsSync).mockReturnValue(false)
})

function systemctlCalls(): unknown[][] {
  return vi.mocked(execFileSync).mock.calls.map(([command, args]) => [command, args])
}

describe('installSchedule', () => {
  it('is a deprecated no-op with no filesystem or scheduler access', () => {
    installSchedule()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('install-schedule is a no-op'))
    expect(getPlatform).not.toHaveBeenCalled()
    expect(existsSync).not.toHaveBeenCalled()
    expect(unlinkSync).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
  })
})

describe('uninstallSchedule', () => {
  it('does not inspect or modify the schedule in dry-run mode', () => {
    uninstallSchedule({ dryRun: true })
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'))
    expect(getPlatform).not.toHaveBeenCalled()
    expect(existsSync).not.toHaveBeenCalled()
    expect(unlinkSync).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
  })

  describe('macOS', () => {
    beforeEach(() => vi.mocked(getPlatform).mockReturnValue('darwin'))

    it('removes only the plist, then unloads by service target as its final operation', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        expect(unlinkSync).toHaveBeenCalledExactlyOnceWith('/Library/LaunchDaemons/com.glean.mdm.plist')
        expect(log.info).toHaveBeenCalledTimes(1)
        return ''
      })
      uninstallSchedule()
      expect(execFileSync).toHaveBeenCalledExactlyOnceWith('launchctl', ['bootout', 'system/com.glean.mdm'], {
        stdio: 'pipe',
      })
      expect(log.info).toHaveBeenCalledTimes(1)
    })

    it('still unloads a loaded job whose plist is already missing', () => {
      vi.mocked(unlinkSync).mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) })
      uninstallSchedule()
      expect(execFileSync).toHaveBeenCalledTimes(1)
    })

    it('succeeds when both the plist and job are already absent', () => {
      vi.mocked(unlinkSync).mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) })
      vi.mocked(execFileSync).mockImplementation(() => { throw Object.assign(new Error('No such process'), { status: 3 }) })
      expect(() => uninstallSchedule()).not.toThrow()
    })

    it('does not unload the job if removing the persistent plist fails', () => {
      const error = Object.assign(new Error('permission denied'), { code: 'EACCES' })
      vi.mocked(unlinkSync).mockImplementation(() => { throw error })
      expect(() => uninstallSchedule()).toThrow(error)
      expect(execFileSync).not.toHaveBeenCalled()
    })

    it('propagates unload failures other than an absent job', () => {
      const error = Object.assign(new Error('Operation not permitted'), { status: 1 })
      vi.mocked(execFileSync).mockImplementation(() => { throw error })
      expect(() => uninstallSchedule()).toThrow(error)
    })
  })

  describe('Linux', () => {
    beforeEach(() => {
      vi.mocked(getPlatform).mockReturnValue('linux')
      vi.mocked(execFileSync).mockReturnValue('LoadState=loaded\nActiveState=active\n')
    })

    it('disables the timer before deleting the units, without stopping the running service', () => {
      vi.mocked(unlinkSync).mockImplementation(() => {
        expect(execFileSync).toHaveBeenCalledWith('systemctl', ['disable', '--now', 'glean-mdm.timer'], { stdio: 'pipe' })
      })
      uninstallSchedule()
      expect(systemctlCalls()).toEqual([
        ['systemctl', ['show', 'glean-mdm.timer', '--property=LoadState,ActiveState']],
        ['systemctl', ['disable', '--now', 'glean-mdm.timer']],
        ['systemctl', ['daemon-reload']],
      ])
      expect(vi.mocked(unlinkSync).mock.calls).toEqual([
        ['/etc/systemd/system/glean-mdm.service'],
        ['/etc/systemd/system/glean-mdm.timer'],
      ])
    })

    it('succeeds when the timer and unit files are already absent', () => {
      vi.mocked(execFileSync).mockReturnValue('LoadState=not-found\nActiveState=inactive\n')
      uninstallSchedule()
      expect(execFileSync).toHaveBeenCalledTimes(1)
      expect(unlinkSync).not.toHaveBeenCalled()
    })

    it('removes leftover unit files even when the timer is not loaded', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(execFileSync).mockReturnValue('LoadState=not-found\nActiveState=inactive\n')
      uninstallSchedule()
      expect(unlinkSync).toHaveBeenCalledTimes(2)
      expect(systemctlCalls()).toEqual([
        ['systemctl', ['show', 'glean-mdm.timer', '--property=LoadState,ActiveState']],
        ['systemctl', ['daemon-reload']],
      ])
    })

    it('stops an active timer even when systemd reports its unit file missing', () => {
      vi.mocked(execFileSync).mockReturnValue('LoadState=not-found\nActiveState=active\n')
      uninstallSchedule()
      expect(systemctlCalls()).toEqual([
        ['systemctl', ['show', 'glean-mdm.timer', '--property=LoadState,ActiveState']],
        ['systemctl', ['stop', 'glean-mdm.timer']],
        ['systemctl', ['daemon-reload']],
      ])
    })

    it('tolerates missing files for a timer that is still loaded', () => {
      vi.mocked(unlinkSync).mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) })
      expect(() => uninstallSchedule()).not.toThrow()
      expect(execFileSync).toHaveBeenLastCalledWith('systemctl', ['daemon-reload'], { stdio: 'pipe' })
    })

    it.each(['show', 'disable', 'daemon-reload'])('propagates systemctl %s failures', (operation) => {
      const error = new Error('systemctl failed')
      vi.mocked(execFileSync).mockImplementation((_command, args) => {
        if (args?.[0] === operation) throw error
        return 'LoadState=loaded\nActiveState=active\n'
      })
      expect(() => uninstallSchedule()).toThrow(error)
      if (operation !== 'daemon-reload') expect(unlinkSync).not.toHaveBeenCalled()
    })

    it('propagates unit-file removal errors', () => {
      const error = Object.assign(new Error('permission denied'), { code: 'EACCES' })
      vi.mocked(unlinkSync).mockImplementation(() => { throw error })
      expect(() => uninstallSchedule()).toThrow(error)
      expect(systemctlCalls()).not.toContainEqual(['systemctl', ['daemon-reload']])
    })
  })

  describe('Windows', () => {
    beforeEach(() => vi.mocked(getPlatform).mockReturnValue('win32'))

    it('uses non-interactive PowerShell to remove only the named root task', () => {
      vi.mocked(execFileSync).mockReturnValue('removed\r\n')
      uninstallSchedule()
      expect(execFileSync).toHaveBeenCalledExactlyOnceWith('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', expect.any(String),
      ], { encoding: 'utf8', stdio: 'pipe' })
      const script = vi.mocked(execFileSync).mock.calls[0][1]?.[3]
      expect(script).toContain("$ErrorActionPreference = 'Stop'")
      expect(script).toContain("$_.TaskPath -eq '\\' -and $_.TaskName -eq 'Glean MDM'")
      expect(script).toContain('if ($null -ne $task)')
      expect(script).toContain('Unregister-ScheduledTask -Confirm:$false')
      expect(unlinkSync).not.toHaveBeenCalled()
      expect(log.info).toHaveBeenCalledWith('Removed Windows Task Scheduler schedule')
    })

    it('does not report removal when the task is absent', () => {
      uninstallSchedule()
      expect(log.info).not.toHaveBeenCalled()
    })

    it('propagates scheduler errors instead of reporting success', () => {
      const error = new Error('Access denied')
      vi.mocked(execFileSync).mockImplementation(() => { throw error })
      expect(() => uninstallSchedule()).toThrow(error)
      expect(log.info).not.toHaveBeenCalled()
    })
  })
})
