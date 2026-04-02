import { describe, it, expect } from 'vitest'

import { compareVersions, shouldUpdate } from './updater'

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0)
  })

  it('returns positive when first is newer', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('returns negative when first is older', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('handles v prefix', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v2.0.0', 'v1.0.0')).toBeGreaterThan(0)
  })

  it('handles different number of parts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0)
  })

  it('compares major version first', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('10.0.0', '9.9.9')).toBeGreaterThan(0)
  })
})

describe('shouldUpdate', () => {
  it('returns false when current matches server version', () => {
    expect(shouldUpdate('1.0.0', '1.0.0')).toBe(false)
  })

  it('returns true when server version is newer', () => {
    expect(shouldUpdate('1.0.0', '2.0.0')).toBe(true)
  })

  it('returns true when current is newer than server (downgrade)', () => {
    expect(shouldUpdate('2.0.0', '1.0.0')).toBe(true)
  })

  it('returns false when current matches pinned version', () => {
    expect(shouldUpdate('1.2.3', '2.0.0', '1.2.3')).toBe(false)
  })

  it('returns true when current is older than pinned version', () => {
    expect(shouldUpdate('1.0.0', '2.0.0', '1.2.3')).toBe(true)
  })

  it('returns true when current is ahead of pinned version (downgrade)', () => {
    expect(shouldUpdate('2.0.0', '2.0.0', '1.2.3')).toBe(true)
  })

  it('returns true when current is ahead of pinned version with different server version', () => {
    expect(shouldUpdate('3.0.0', '2.0.0', '1.2.3')).toBe(true)
  })

  it('handles v-prefix in pinned version', () => {
    expect(shouldUpdate('1.2.3', '2.0.0', 'v1.2.3')).toBe(false)
  })

  it('ignores server version when pinned version is set', () => {
    expect(shouldUpdate('1.2.3', '3.0.0', '1.2.3')).toBe(false)
    expect(shouldUpdate('1.0.0', '3.0.0', '1.2.3')).toBe(true)
  })
})
