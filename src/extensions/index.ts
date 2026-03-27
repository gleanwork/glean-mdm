import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { log } from '../logger.js'
import type { Platform } from '../platform.js'
import { getPlatform } from '../platform.js'

const EXTENSION_ID = 'glean.glean'
const INSTALL_TIMEOUT_MS = 120_000

export interface InstallExtensionsOptions {
  dryRun?: boolean
  gid?: number
  uid?: number
  userHomeDir: string
  username: string
}

export interface ExtensionInstallResult {
  editor: string
  error?: string
  skipped?: boolean
  success: boolean
}

interface EditorCliPaths {
  darwin: string[]
  linux: string[]
  win32: string[]
}

interface EditorDefinition {
  cliPaths: EditorCliPaths
  extensionsDirName: string
  id: string
}

function editorDefinitions(userHomeDir: string): EditorDefinition[] {
  return [
    {
      id: 'cursor',
      extensionsDirName: '.cursor',
      cliPaths: {
        darwin: [
          '/usr/local/bin/cursor',
          '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
        ],
        linux: [
          '/usr/local/bin/cursor',
          '/usr/bin/cursor',
          '/opt/Cursor/resources/app/bin/cursor',
        ],
        win32: [
          'C:\\Program Files\\Cursor\\resources\\app\\bin\\cursor.cmd',
          join(userHomeDir, 'AppData', 'Local', 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
        ],
      },
    },
    {
      id: 'windsurf',
      extensionsDirName: '.windsurf',
      cliPaths: {
        darwin: [
          '/usr/local/bin/windsurf',
          '/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf',
        ],
        linux: [
          '/usr/local/bin/windsurf',
          '/usr/bin/windsurf',
          '/opt/Windsurf/resources/app/bin/windsurf',
        ],
        win32: [
          'C:\\Program Files\\Windsurf\\resources\\app\\bin\\windsurf.cmd',
          join(userHomeDir, 'AppData', 'Local', 'Programs', 'windsurf', 'resources', 'app', 'bin', 'windsurf.cmd'),
        ],
      },
    },
    {
      id: 'antigravity',
      extensionsDirName: '.antigravity',
      cliPaths: {
        darwin: [
          '/usr/local/bin/antigravity',
          '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity',
        ],
        linux: [
          '/usr/local/bin/antigravity',
          '/usr/bin/antigravity',
          '/opt/Antigravity/resources/app/bin/antigravity',
        ],
        win32: [
          'C:\\Program Files\\Antigravity\\resources\\app\\bin\\antigravity.cmd',
          join(userHomeDir, 'AppData', 'Local', 'Programs', 'antigravity', 'resources', 'app', 'bin', 'antigravity.cmd'),
        ],
      },
    },
  ]
}

export function findEditorCli(editorId: string, candidates: string[], platform: Platform): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  // Fallback: check system PATH
  try {
    const cmd = platform === 'win32' ? 'where' : 'which'
    const result = execFileSync(cmd, [editorId], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const found = result.trim().split('\n')[0].trim()
    if (found && existsSync(found)) return found
  } catch {
    // Not on PATH
  }

  return null
}

export function findOldExtensionDirs(extensionsDir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(extensionsDir)
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.startsWith('glean.glean-'))
    .map((entry) => join(extensionsDir, entry))
}

export function removeExtensionDirs(dirs: string[]): void {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
      log.info(`Removed old extension: ${dir}`)
    } catch (err) {
      log.warn(`Failed to remove old extension ${dir}: ${err}`)
    }
  }
}

function runInstallExtension(
  cliPath: string,
  username: string,
  extensionsDir: string,
  platform: Platform,
): void {
  if (platform === 'win32') {
    execFileSync(cliPath, ['--install-extension', EXTENSION_ID, '--extensions-dir', extensionsDir], {
      stdio: 'pipe',
      timeout: INSTALL_TIMEOUT_MS,
    })
  } else {
    execFileSync('sudo', ['-H', '-u', username, cliPath, '--install-extension', EXTENSION_ID], {
      stdio: 'pipe',
      timeout: INSTALL_TIMEOUT_MS,
    })
  }
}

export function installExtensions(options: InstallExtensionsOptions): ExtensionInstallResult[] {
  const { dryRun, userHomeDir, username } = options
  const platform = getPlatform()
  const editors = editorDefinitions(userHomeDir)
  const results: ExtensionInstallResult[] = []

  for (const editor of editors) {
    const candidates = editor.cliPaths[platform]
    const cliPath = findEditorCli(editor.id, candidates, platform)

    if (!cliPath) {
      log.info(`${editor.id}: CLI not found, skipping extension install`)
      results.push({ editor: editor.id, success: true, skipped: true })
      continue
    }

    if (dryRun) {
      log.info(`[DRY RUN] Would install extension for ${editor.id} via ${cliPath}`)
      results.push({ editor: editor.id, success: true })
      continue
    }

    try {
      const extensionsDir = join(userHomeDir, editor.extensionsDirName, 'extensions')
      const oldDirs = findOldExtensionDirs(extensionsDir)
      runInstallExtension(cliPath, username, extensionsDir, platform)
      removeExtensionDirs(oldDirs)
      log.info(`Installed extension for ${editor.id} via ${cliPath}`)
      results.push({ editor: editor.id, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error(`Failed to install extension for ${editor.id}: ${message}`)
      results.push({ editor: editor.id, success: false, error: message })
    }
  }

  return results
}
