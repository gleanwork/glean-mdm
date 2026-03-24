import { describe, it, expect } from 'vitest'

import { getBackendUrl, getServerUrl, MdmConfigSchema } from './config'

describe('MdmConfigSchema', () => {
  const VALID_CONFIG = {
    serverName: 'glean_default',
    url: 'https://customer-be.glean.com/mcp/default',
  }

  it('accepts a valid config', () => {
    const result = MdmConfigSchema.safeParse(VALID_CONFIG)

    expect(result.success).toBe(true)
  })

  it('config shape remains stable (regression guard)', () => {
    const result = MdmConfigSchema.safeParse(VALID_CONFIG)

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.serverName).toBe('glean_default')
      expect(result.data.url).toBe('https://customer-be.glean.com/mcp/default')
    }
  })

  it('rejects missing required fields', () => {
    expect(MdmConfigSchema.safeParse({}).success).toBe(false)
    expect(MdmConfigSchema.safeParse({ serverName: 'x' }).success).toBe(false)
    expect(MdmConfigSchema.safeParse({ url: 'https://example.com/mcp/default' }).success).toBe(false)
  })

  it('rejects empty strings', () => {
    expect(
      MdmConfigSchema.safeParse({
        ...VALID_CONFIG,
        serverName: '',
      }).success,
    ).toBe(false)
  })

  it('accepts configs with extra fields (forward compatibility)', () => {
    const result = MdmConfigSchema.safeParse({
      ...VALID_CONFIG,
      someNewField: 'future-value',
    })

    expect(result.success).toBe(true)
  })

  describe('autoUpdate', () => {
    it('defaults to true when not set', () => {
      const result = MdmConfigSchema.safeParse(VALID_CONFIG)

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.autoUpdate).toBe(true)
    })

    it('accepts explicit true', () => {
      const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, autoUpdate: true })

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.autoUpdate).toBe(true)
    })

    it('accepts explicit false', () => {
      const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, autoUpdate: false })

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.autoUpdate).toBe(false)
    })

    it('coerces non-boolean values to true', () => {
      for (const invalid of ['yes', 123, null]) {
        const result = MdmConfigSchema.safeParse({ ...VALID_CONFIG, autoUpdate: invalid })

        expect(result.success).toBe(true)
        if (result.success) expect(result.data.autoUpdate).toBe(true)
      }
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

describe('getBackendUrl', () => {
  it('strips the /mcp/... path suffix', () => {
    expect(getBackendUrl('https://customer-be.glean.com/mcp/default')).toBe('https://customer-be.glean.com')
  })

  it('strips a custom /mcp path', () => {
    expect(getBackendUrl('https://customer-be.glean.com/mcp/custom/path')).toBe('https://customer-be.glean.com')
  })

  it('returns the URL unchanged if no /mcp/ path present', () => {
    expect(getBackendUrl('https://customer-be.glean.com')).toBe('https://customer-be.glean.com')
  })
})
