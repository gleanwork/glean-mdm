import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { configureJsonFile } from './json-configurator'
import { configureTomlFile } from './toml-configurator'
import { configureYamlFile } from './yaml-configurator'

const configToMerge = {
  mcpServers: {
    glean_default: {
      type: 'http',
      url: 'https://example-be.glean.com/mcp/default',
    },
  },
}

const formats = [
  {
    configure: configureJsonFile,
    extension: 'json',
    format: 'JSON',
    invalidContent: '{"mcpServers":',
    nonObjectContent: '[]',
  },
  {
    configure: configureTomlFile,
    extension: 'toml',
    format: 'TOML',
    invalidContent: 'mcp_servers = [',
  },
  {
    configure: configureYamlFile,
    extension: 'yaml',
    format: 'YAML',
    invalidContent: 'mcpServers: [unterminated',
    nonObjectContent: '- item\n',
  },
]

describe.each(formats)('$format managed configuration', (formatCase) => {
  let tempDir: string
  let filePath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), `managed-${formatCase.extension}-test-`))
    filePath = join(tempDir, `config.${formatCase.extension}`)
  })

  it('preserves malformed files byte-for-byte', () => {
    writeFileSync(filePath, formatCase.invalidContent)

    expect(() => formatCase.configure({ configToMerge, filePath })).toThrow(
      `Cannot update invalid ${formatCase.format} configuration`,
    )

    expect(readFileSync(filePath, 'utf-8')).toBe(formatCase.invalidContent)
    expect(readdirSync(tempDir)).toEqual([`config.${formatCase.extension}`])
  })

  it('does not treat read errors as missing files', () => {
    mkdirSync(filePath)

    expect(() => formatCase.configure({ configToMerge, filePath })).toThrow()
    expect(readdirSync(tempDir)).toEqual([`config.${formatCase.extension}`])
  })

  if (formatCase.nonObjectContent) {
    it('preserves files whose root value is not an object', () => {
      writeFileSync(filePath, formatCase.nonObjectContent)

      expect(() => formatCase.configure({ configToMerge, filePath })).toThrow(/root value must be an object/)
      expect(readFileSync(filePath, 'utf-8')).toBe(formatCase.nonObjectContent)
    })
  }
})
