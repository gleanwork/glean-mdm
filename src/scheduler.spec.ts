import { describe, it, expect } from 'vitest'

import { schtasksCreateArgs } from './scheduler'

describe('schtasksCreateArgs', () => {
  it('passes the binary path as a single argv element (paths with spaces)', () => {
    const pathWithSpaces = 'C:\\Program Files\\Glean\\glean-mdm.exe'

    expect(schtasksCreateArgs(pathWithSpaces, 7)).toEqual([
      '/Create',
      '/TN',
      'Glean MDM',
      '/TR',
      `${pathWithSpaces} setup`,
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