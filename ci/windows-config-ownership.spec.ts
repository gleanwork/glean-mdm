import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, rmdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, win32 as win32Path } from 'node:path'

import { createGleanRegistry } from '@gleanwork/mcp-config-glean'
import { afterAll, describe, expect, it } from 'vitest'

function expandConfigPath(configPath: string, userHomeDir: string): string {
  return configPath
    .replace('$HOME', userHomeDir)
    .replace('%USERPROFILE%', userHomeDir)
    .replace('%APPDATA%', `${userHomeDir}\\AppData\\Roaming`)
}

function runBinary(binaryPath: string, args: string[]): string {
  return execFileSync(binaryPath, args, {
    encoding: 'utf-8',
    stdio: 'pipe',
  })
}

function getOwner(filePath: string): string {
  const escaped = filePath.replace(/'/g, "''")
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `(Get-Acl -LiteralPath '${escaped}').Owner`],
    { encoding: 'utf-8', stdio: 'pipe' },
  ).trim()
}

function collectManagedPaths(userHomeDir: string): string[] {
  const registry = createGleanRegistry()
  return registry
    .getClientsByPlatform('win32')
    .filter((client) => client.configPath.win32 && client.userConfigurable && client.transports.includes('http'))
    .map((client) => expandConfigPath(client.configPath.win32!, userHomeDir))
}

function collectMissingAncestors(filePath: string, stopAt: string, existingPaths: Set<string>): string[] {
  const stopDir = win32Path.resolve(stopAt)
  const missingDirs: string[] = []
  let dir = win32Path.dirname(win32Path.resolve(filePath))

  while (dir.length > stopDir.length && dir.startsWith(stopDir)) {
    if (existingPaths.has(dir)) break
    missingDirs.push(dir)
    dir = win32Path.dirname(dir)
  }

  return missingDirs.reverse()
}

describe('Windows config ownership integration', () => {
  const binaryPath = process.env.GLEAN_MDM_BINARY
  const userHomeDir = homedir()
  const configDir = join(tmpdir(), `glean-mdm-win-config-${Date.now()}`)
  const mcpConfigPath = join(configDir, 'mcp-config.json')
  const mdmConfigPath = join(configDir, 'mdm-config.json')
  const cleanupFiles = new Set<string>()
  const cleanupDirs = new Set<string>()

  afterAll(() => {
    for (const filePath of cleanupFiles) {
      rmSync(filePath, { force: true })
    }

    for (const dirPath of [...cleanupDirs].sort((a, b) => b.length - a.length)) {
      try {
        rmdirSync(dirPath)
      } catch {
        // Ignore non-empty or already-removed directories.
      }
    }

    rmSync(configDir, { recursive: true, force: true })
  })

  it('assigns the current user as owner for newly created config files and directories', () => {
    expect(process.platform).toBe('win32')
    expect(binaryPath).toBeTruthy()

    mkdirSync(configDir, { recursive: true })

    const expectedOwner = getOwner(userHomeDir)
    const managedPaths = collectManagedPaths(userHomeDir)
    const existingPaths = new Set<string>()

    for (const filePath of managedPaths) {
      if (existsSync(filePath)) existingPaths.add(win32Path.resolve(filePath))

      let dir = win32Path.dirname(win32Path.resolve(filePath))
      const stopDir = win32Path.resolve(userHomeDir)
      while (dir.length > stopDir.length && dir.startsWith(stopDir)) {
        if (existsSync(dir)) existingPaths.add(dir)
        dir = win32Path.dirname(dir)
      }
    }

    runBinary(binaryPath!, [
      'config',
      '--server-name',
      'e2e_config_test',
      '--server-url',
      'https://example.invalid/mcp/default',
      '--no-auto-update',
      '--binary-url-prefix',
      'https://example.invalid/static/mdm/binaries',
      '--output-dir',
      configDir,
    ])

    const runOutput = runBinary(binaryPath!, [
      'run',
      '--skip-update',
      '--mcp-config',
      mcpConfigPath,
      '--mdm-config',
      mdmConfigPath,
    ])

    const configuredFiles = [...runOutput.matchAll(/Configured (?:JSON|TOML|YAML): (.+)/g)].map((match) => match[1].trim())

    expect(configuredFiles.length).toBeGreaterThan(0)

    const createdFiles = configuredFiles.filter((filePath) => !existingPaths.has(win32Path.resolve(filePath)))
    const createdDirs = configuredFiles.flatMap((filePath) =>
      collectMissingAncestors(filePath, userHomeDir, existingPaths),
    )

    expect(createdFiles.length + createdDirs.length).toBeGreaterThan(0)

    for (const filePath of createdFiles) {
      cleanupFiles.add(filePath)
      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, 'utf-8')).toContain('example.invalid')
      expect(getOwner(filePath)).toBe(expectedOwner)
    }

    for (const dirPath of createdDirs) {
      cleanupDirs.add(dirPath)
      expect(existsSync(dirPath)).toBe(true)
      expect(getOwner(dirPath)).toBe(expectedOwner)
    }
  })
})
