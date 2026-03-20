import { describe, it, expect } from 'vitest'

import {
  getArch,
  getBinaryInstallPath,
  getDefaultConfigPath,
  getLogFilePath,
  getPlatform,
  getTargetName,
} from './platform'

describe('getPlatform', () => {
  it('returns a valid platform', () => {
    const platform = getPlatform()

    expect(['darwin', 'linux', 'win32']).toContain(platform)
  })
})

describe('getArch', () => {
  it('returns a valid architecture', () => {
    const arch = getArch()

    expect(['arm64', 'x64']).toContain(arch)
  })
})

const TARGET_FORMAT = /^(darwin|linux|windows)-(arm64|x64)$/

describe('getTargetName', () => {
  it('returns platform-arch format matching build artifact names', () => {
    const target = getTargetName()

    expect(target).toMatch(TARGET_FORMAT)
  })
})

describe('getDefaultConfigPath', () => {
  it('returns a non-empty path', () => {
    expect(getDefaultConfigPath().length).toBeGreaterThan(0)
  })

  it("contains 'Glean' in the path", () => {
    const path = getDefaultConfigPath()

    expect(path.toLowerCase()).toContain('glean')
  })
})

describe('getLogFilePath', () => {
  it('returns a path ending with the log filename', () => {
    expect(getLogFilePath()).toContain('glean-mdm-setup.log')
  })
})

describe('getBinaryInstallPath', () => {
  it('returns a path containing the binary name', () => {
    expect(getBinaryInstallPath()).toContain('glean-mdm-setup')
  })
})
