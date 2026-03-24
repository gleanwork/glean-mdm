import { arch, platform } from 'node:os'

export type Platform = 'darwin' | 'linux' | 'win32'
export type Arch = 'arm64' | 'x64'

export function getPlatform(): Platform {
  const p = platform()
  if (p === 'darwin' || p === 'linux' || p === 'win32') return p
  throw new Error(`Unsupported platform: ${p}`)
}

export function getArch(): Arch {
  const a = arch()
  if (a === 'arm64') return 'arm64'
  if (a === 'x64') return 'x64'
  throw new Error(`Unsupported architecture: ${a}`)
}

export function getTargetName(): string {
  const p = getPlatform()
  const platformName = p === 'win32' ? 'windows' : p
  return `${platformName}-${getArch()}`
}

export function getDefaultMcpConfigPath(): string {
  switch (getPlatform()) {
    case 'darwin':
      return '/Library/Application Support/Glean MDM/mcp-config.json'
    case 'linux':
      return '/etc/glean_mdm/mcp-config.json'
    case 'win32':
      return 'C:\\ProgramData\\Glean MDM\\mcp-config.json'
  }
}

export function getDefaultMdmConfigPath(): string {
  switch (getPlatform()) {
    case 'darwin':
      return '/Library/Application Support/Glean MDM/mdm-config.json'
    case 'linux':
      return '/etc/glean_mdm/mdm-config.json'
    case 'win32':
      return 'C:\\ProgramData\\Glean MDM\\mdm-config.json'
  }
}

export function getLogFilePath(): string {
  const p = getPlatform()
  if (p === 'win32') return 'C:\\ProgramData\\Glean MDM\\glean-mdm.log'
  return '/var/log/glean-mdm.log'
}

export function getBinaryInstallPath(): string {
  const p = getPlatform()
  if (p === 'win32') return 'C:\\Program Files\\Glean\\glean-mdm.exe'
  return '/usr/local/bin/glean-mdm'
}
