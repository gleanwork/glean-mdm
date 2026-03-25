import { describe, it, expect } from 'vitest'

import {
  getArch,
  getBinaryInstallPath,
  getDefaultConfigDir,
  getDefaultMcpConfigPath,
  getDefaultMdmConfigPath,
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

describe('getDefaultConfigDir', () => {
  it('returns a non-empty path', () => {
    expect(getDefaultConfigDir().length).toBeGreaterThan(0)
  })

  it("contains 'glean' in the path (case-insensitive)", () => {
    expect(getDefaultConfigDir().toLowerCase()).toContain('glean')
  })
})

describe('getDefaultMcpConfigPath', () => {
  it('returns a non-empty path', () => {
    expect(getDefaultMcpConfigPath().length).toBeGreaterThan(0)
  })

  it("contains 'Glean' in the path", () => {
    const path = getDefaultMcpConfigPath()

    expect(path.toLowerCase()).toContain('glean')
  })

  it('ends with mcp-config.json', () => {
    expect(getDefaultMcpConfigPath()).toMatch(/mcp-config\.json$/)
  })
})

describe('getDefaultMdmConfigPath', () => {
  it('returns a non-empty path', () => {
    expect(getDefaultMdmConfigPath().length).toBeGreaterThan(0)
  })

  it("contains 'Glean' in the path", () => {
    const path = getDefaultMdmConfigPath()

    expect(path.toLowerCase()).toContain('glean')
  })

  it('ends with mdm-config.json', () => {
    expect(getDefaultMdmConfigPath()).toMatch(/mdm-config\.json$/)
  })
})

describe('getLogFilePath', () => {
  it('returns a path ending with the log filename', () => {
    expect(getLogFilePath()).toContain('glean-mdm.log')
  })
})

describe('getBinaryInstallPath', () => {
  it('returns a path containing the binary name', () => {
    expect(getBinaryInstallPath()).toContain('glean-mdm')
  })
})
