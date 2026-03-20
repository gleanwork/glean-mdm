import { describe, it, expect } from 'vitest'

import { schtasksCreateArgs } from './scheduler'

describe('schtasksCreateArgs', () => {
  it('passes the binary path as a single argv element (paths with spaces)', () => {
    const pathWithSpaces = 'C:\\Program Files\\Glean\\glean-mdm-setup.exe'

    expect(schtasksCreateArgs(pathWithSpaces)).toEqual([
      '/Create',
      '/TN',
      'Glean MDM Setup',
      '/TR',
      pathWithSpaces,
      '/SC',
      'DAILY',
      '/ST',
      '09:00',
      '/RU',
      'SYSTEM',
      '/F',
    ])
  })
})
