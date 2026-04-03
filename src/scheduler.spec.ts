import { describe, it, expect } from 'vitest'

import { buildMacOSPlist, schtasksCreateArgs } from './scheduler'

describe('buildMacOSPlist', () => {
  it('includes the binary path, run subcommand, and schedule', () => {
    const plist = buildMacOSPlist('/usr/local/bin/glean-mdm', 7)

    expect(plist).toContain('<string>/usr/local/bin/glean-mdm</string>')
    expect(plist).toContain('<string>run</string>')
    expect(plist).toContain('<string>com.glean.mdm</string>')
    expect(plist).toContain('<integer>7</integer>')
  })

  it('does not redirect stdout or stderr into the app log file', () => {
    const plist = buildMacOSPlist('/usr/local/bin/glean-mdm', 7)

    expect(plist).not.toContain('StandardOutPath')
    expect(plist).not.toContain('StandardErrorPath')
  })
})

describe('schtasksCreateArgs', () => {
  it('passes the binary path as a single argv element (paths with spaces)', () => {
    const pathWithSpaces = 'C:\\Program Files\\Glean\\glean-mdm.exe'

    expect(schtasksCreateArgs(pathWithSpaces, 7)).toEqual([
      '/Create',
      '/TN',
      'Glean MDM',
      '/TR',
      `"${pathWithSpaces}" run`,
      '/SC',
      'DAILY',
      '/ST',
      '09:07',
      '/RU',
      'SYSTEM',
      '/F',
    ])
  })

  it('zero-pads single-digit minutes', () => {
    const args = schtasksCreateArgs('C:\\glean-mdm.exe', 3)
    expect(args).toContain('09:03')
  })

  it('does not pad two-digit minutes', () => {
    const args = schtasksCreateArgs('C:\\glean-mdm.exe', 45)
    expect(args).toContain('09:45')
  })
})
