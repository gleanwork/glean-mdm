import { lstatSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import YAML from 'yaml'
import { describe, it, expect, beforeEach } from 'vitest'

import { configureYamlFile } from './yaml-configurator'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mdm-yaml-test-'))
})

describe('configureYamlFile', () => {
  it('creates a new YAML config file when none exists', () => {
    const filePath = join(tempDir, 'config.yaml')

    configureYamlFile({
      configToMerge: {
        extensions: {
          glean_default: {
            type: 'streamable_http',
            uri: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = YAML.parse(readFileSync(filePath, 'utf-8'))

    expect(result.extensions.glean_default).toEqual({
      type: 'streamable_http',
      uri: 'https://example-be.glean.com/mcp/default',
    })
  })

  it('merges into an existing YAML config preserving other entries', () => {
    const filePath = join(tempDir, 'config.yaml')
    writeFileSync(
      filePath,
      YAML.stringify({
        extensions: {
          other_ext: { type: 'sse', uri: 'https://other.com' },
        },
        settings: { theme: 'dark' },
      }),
    )

    configureYamlFile({
      configToMerge: {
        extensions: {
          glean_default: {
            type: 'streamable_http',
            uri: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = YAML.parse(readFileSync(filePath, 'utf-8'))

    expect(result.extensions.other_ext.uri).toBe('https://other.com')
    expect(result.extensions.glean_default.uri).toBe('https://example-be.glean.com/mcp/default')
    expect(result.settings.theme).toBe('dark')
  })

  it('overwrites an existing entry for the same server name', () => {
    const filePath = join(tempDir, 'config.yaml')
    writeFileSync(
      filePath,
      YAML.stringify({
        extensions: {
          glean_default: { type: 'sse', uri: 'https://old.com' },
        },
      }),
    )

    configureYamlFile({
      configToMerge: {
        extensions: {
          glean_default: {
            type: 'streamable_http',
            uri: 'https://new-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = YAML.parse(readFileSync(filePath, 'utf-8'))

    expect(result.extensions.glean_default).toEqual({
      type: 'streamable_http',
      uri: 'https://new-be.glean.com/mcp/default',
    })
  })

  it('is idempotent', () => {
    const filePath = join(tempDir, 'config.yaml')
    const options = {
      configToMerge: {
        extensions: {
          glean_default: {
            type: 'streamable_http',
            uri: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    }

    configureYamlFile(options)
    const firstRun = readFileSync(filePath, 'utf-8')

    configureYamlFile(options)
    const secondRun = readFileSync(filePath, 'utf-8')

    expect(firstRun).toBe(secondRun)
  })

  it('preserves symlinks and updates the target file', () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'mdm-yaml-target-'))
    const targetPath = join(targetDir, 'config.yaml')
    writeFileSync(
      targetPath,
      YAML.stringify({
        extensions: {
          existing: { type: 'sse', uri: 'https://existing.com' },
        },
      }),
    )

    const symlinkPath = join(tempDir, 'config.yaml')
    symlinkSync(targetPath, symlinkPath)

    configureYamlFile({
      configToMerge: {
        extensions: {
          glean_default: {
            type: 'streamable_http',
            uri: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath: symlinkPath,
    })

    expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(symlinkPath)).toBe(targetPath)

    const result = YAML.parse(readFileSync(targetPath, 'utf-8'))
    expect(result.extensions.existing).toEqual({ type: 'sse', uri: 'https://existing.com' })
    expect(result.extensions.glean_default).toEqual({
      type: 'streamable_http',
      uri: 'https://example-be.glean.com/mcp/default',
    })
  })

  it('handles empty existing file', () => {
    const filePath = join(tempDir, 'config.yaml')
    writeFileSync(filePath, '')

    configureYamlFile({
      configToMerge: {
        extensions: {
          glean_default: {
            type: 'streamable_http',
            uri: 'https://example-be.glean.com/mcp/default',
          },
        },
      },
      filePath,
    })

    const result = YAML.parse(readFileSync(filePath, 'utf-8'))

    expect(result.extensions.glean_default.uri).toBe('https://example-be.glean.com/mcp/default')
  })
})
