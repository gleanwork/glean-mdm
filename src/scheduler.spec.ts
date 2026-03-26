import { describe, it, expect } from 'vitest'

import { schtasksCreateArgs, randomMinute } from './scheduler'

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

describe('randomMinute', () => {
  it('returns a value between 0 and 59', () => {
    for (let i = 0; i < 100; i++) {
      const m = randomMinute()
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThan(60)
      expect(Number.isInteger(m)).toBe(true)
    }
  })
})
