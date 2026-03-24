import { describe, it, expect } from 'vitest'

import { getServerUrl, McpConfigSchema, MdmConfigSchema } from './config'

describe('McpConfigSchema', () => {
  it('accepts a single server object and normalizes to array', () => {
    const result = McpConfigSchema.safeParse({ serverName: 'glean_default', url: 'https://example.com/mcp/default' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([{ serverName: 'glean_default', url: 'https://example.com/mcp/default' }])
    }
  })

  it('accepts an array of server objects', () => {
    const result = McpConfigSchema.safeParse([
      { serverName: 'server1', url: 'https://one.example.com/mcp/default' },
      { serverName: 'server2', url: 'https://two.example.com/mcp/default' },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0].serverName).toBe('server1')
      expect(result.data[1].serverName).toBe('server2')
    }
  })

  it('rejects an empty array', () => {
    expect(McpConfigSchema.safeParse([]).success).toBe(false)
  })

  it('rejects missing required fields', () => {
    expect(McpConfigSchema.safeParse({}).success).toBe(false)
    expect(McpConfigSchema.safeParse({ serverName: 'x' }).success).toBe(false)
    expect(McpConfigSchema.safeParse({ url: 'https://example.com/mcp/default' }).success).toBe(false)
  })

  it('rejects empty strings', () => {
    expect(McpConfigSchema.safeParse({ serverName: '', url: 'https://example.com/mcp/default' }).success).toBe(false)
    expect(McpConfigSchema.safeParse({ serverName: 'x', url: '' }).success).toBe(false)
  })

  it('rejects array entries with missing fields', () => {
    expect(McpConfigSchema.safeParse([{ serverName: 'x' }]).success).toBe(false)
  })

  it('accepts configs with extra fields (forward compatibility)', () => {
    const result = McpConfigSchema.safeParse({
      serverName: 'glean_default',
      url: 'https://example.com/mcp/default',
      someNewField: 'future-value',
    })

    expect(result.success).toBe(true)
  })
})

describe('MdmConfigSchema', () => {
  const VALID_CONFIG = {
    autoUpdate: true,
    versionUrl: 'https://customer-be.glean.com/api/v1/mdm/version',
    binaryUrlPrefix: 'https://app.glean.com/static/mdm/binaries',
  }

  it('accepts a valid config', () => {
    const result = MdmConfigSchema.safeParse(VALID_CONFIG)

    expect(result.success).toBe(true)
  })

  it('accepts configs with extra fields (forward compatibility)', () => {
    const result = MdmConfigSchema.safeParse({
      ...VALID_CONFIG,
      someNewField: 'future-value',
    })

    expect(result.success).toBe(true)
  })

  describe('autoUpdate', () => {
    it('accepts explicit true', () => {
      const result = MdmConfigSchema.safeParse(VALID_CONFIG)

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.autoUpdate).toBe(true)
    })

    it('accepts explicit false', () => {
      const { versionUrl: _, ...configWithoutVersionUrl } = VALID_CONFIG
      const result = MdmConfigSchema.safeParse({ ...configWithoutVersionUrl, autoUpdate: false })

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.autoUpdate).toBe(false)
    })

    it('rejects missing autoUpdate', () => {
      const { autoUpdate: _, ...configWithout } = VALID_CONFIG
      expect(MdmConfigSchema.safeParse(configWithout).success).toBe(false)
    })

    it('rejects non-boolean values', () => {
      for (const invalid of ['yes', 123, null]) {
        expect(MdmConfigSchema.safeParse({ ...VALID_CONFIG, autoUpdate: invalid }).success).toBe(false)
      }
    })
  })

  describe('versionUrl', () => {
    it('accepts a valid URL when autoUpdate is true', () => {
      const result = MdmConfigSchema.safeParse(VALID_CONFIG)

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.versionUrl).toBe('https://customer-be.glean.com/api/v1/mdm/version')
    })

    it('is optional when autoUpdate is false', () => {
      const result = MdmConfigSchema.safeParse({
        autoUpdate: false,
        binaryUrlPrefix: 'https://app.glean.com/static/mdm/binaries',
      })

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.versionUrl).toBeUndefined()
    })

    it('rejects missing versionUrl when autoUpdate is true', () => {
      const { versionUrl: _, ...configWithout } = VALID_CONFIG
      expect(MdmConfigSchema.safeParse(configWithout).success).toBe(false)
    })

    it('rejects non-URL strings', () => {
      expect(MdmConfigSchema.safeParse({ ...VALID_CONFIG, versionUrl: 'not-a-url' }).success).toBe(false)
    })
  })

  describe('pinnedVersion', () => {
    it('defaults to undefined when not set', () => {
      const result = MdmConfigSchema.safeParse(VALID_CONFIG)

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.pinnedVersion).toBeUndefined()
    })

    it('accepts valid semver strings', () => {
      for (const version of ['1.2.3', 'v1.2.3', '0.0.1', 'v10.20.30']) {
        const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, pinnedVersion: version })

        expect(result.success).toBe(true)
        if (result.success) expect(result.data.pinnedVersion).toBe(version)
      }
    })

    it('ignores invalid semver strings', () => {
      for (const invalid of ['not-a-version', '1.2', '', '1.2.3.4']) {
        const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, pinnedVersion: invalid })

        expect(result.success).toBe(true)
        if (result.success) expect(result.data.pinnedVersion).toBeUndefined()
      }
    })

    it('ignores non-string values', () => {
      for (const invalid of [123, true, null]) {
        const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, pinnedVersion: invalid })

        expect(result.success).toBe(true)
        if (result.success) expect(result.data.pinnedVersion).toBeUndefined()
      }
    })
  })

  describe('binaryUrlPrefix', () => {
    it('accepts valid URL strings', () => {
      for (const prefix of ['https://cdn.example.com/mdm/binaries', 'https://internal.corp/assets']) {
        const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, binaryUrlPrefix: prefix })

        expect(result.success).toBe(true)
        if (result.success) expect(result.data.binaryUrlPrefix).toBe(prefix)
      }
    })

    it('strips trailing slashes', () => {
      const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, binaryUrlPrefix: 'https://cdn.example.com/binaries/' })

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.binaryUrlPrefix).toBe('https://cdn.example.com/binaries')
    })

    it('rejects missing binaryUrlPrefix', () => {
      const { binaryUrlPrefix: _, ...configWithout } = VALID_CONFIG
      expect(MdmConfigSchema.safeParse(configWithout).success).toBe(false)
    })

    it('rejects empty strings', () => {
      expect(MdmConfigSchema.safeParse({ ...VALID_CONFIG, binaryUrlPrefix: '' }).success).toBe(false)
    })

    it('rejects non-URL strings', () => {
      for (const invalid of ['not-a-url', 'just-text', '/relative/path']) {
        expect(MdmConfigSchema.safeParse({ ...VALID_CONFIG, binaryUrlPrefix: invalid }).success).toBe(false)
      }
    })

    it('rejects non-string values', () => {
      for (const invalid of [123, true, null]) {
        expect(MdmConfigSchema.safeParse({ ...VALID_CONFIG, binaryUrlPrefix: invalid }).success).toBe(false)
      }
    })
  })
})

describe('getServerUrl', () => {
  it('returns the url directly', () => {
    expect(
      getServerUrl({
        serverName: 'glean_default',
        url: 'https://customer-be.glean.com/mcp/default',
      }),
    ).toBe('https://customer-be.glean.com/mcp/default')
  })
})
