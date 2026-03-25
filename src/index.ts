import { ZodError } from 'zod'

import { getServerUrl, readMcpConfig, readMdmConfig } from './config.js'
import { writeConfig } from './config-writer.js'
import { configureHosts } from './hosts/index.js'
import { initLogger, log } from './logger.js'
import { installSchedule, uninstallSchedule } from './scheduler.js'
import { checkForUpdate } from './updater.js'
import { enumerateUsers, lookupUser } from './users.js'
import { BUILD_VERSION } from './version.js'

export interface CliOptions {
  mcpConfigPath?: string
  mdmConfigPath?: string
  dryRun: boolean
  showHelp: boolean
  showVersion: boolean
  singleUser?: string
  skipUpdate: boolean
  subcommand?: 'setup' | 'install-schedule' | 'uninstall-schedule' | 'uninstall' | 'config'
  serverName?: string
  serverUrl?: string
  autoUpdate?: boolean
  versionUrl?: string
  binaryUrlPrefix?: string
  pinnedVersion?: string
  outputDir?: string
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    showHelp: false,
    showVersion: false,
    skipUpdate: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mcp-config':
        options.mcpConfigPath = args[++i]
        break
      case '--mdm-config':
        options.mdmConfigPath = args[++i]
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--user':
        options.singleUser = args[++i]
        break
      case '--skip-update':
        options.skipUpdate = true
        break
      case '--help':
      case '-h':
        options.showHelp = true
        break
      case '--version':
        options.showVersion = true
        break
      case 'setup':
        options.subcommand = 'setup'
        break
      case 'install-schedule':
        options.subcommand = 'install-schedule'
        break
      case 'uninstall-schedule':
        options.subcommand = 'uninstall-schedule'
        break
      case 'uninstall':
        options.subcommand = 'uninstall'
        break
      case 'config':
        options.subcommand = 'config'
        break
      case '--server-name':
        options.serverName = args[++i]
        break
      case '--server-url':
        options.serverUrl = args[++i]
        break
      case '--auto-update':
        options.autoUpdate = true
        break
      case '--no-auto-update':
        options.autoUpdate = false
        break
      case '--version-url':
        options.versionUrl = args[++i]
        break
      case '--binary-url-prefix':
        options.binaryUrlPrefix = args[++i]
        break
      case '--pinned-version':
        options.pinnedVersion = args[++i]
        break
      case '--output-dir':
        options.outputDir = args[++i]
        break
    }
  }

  return options
}

function printHelp(): void {
  process.stdout.write(`glean-mdm ${BUILD_VERSION}

Configure MCP servers across AI coding tools on managed devices.

Usage:
  glean-mdm <command> [flags]

Commands:
  setup               Run host configuration for all users
  config              Generate mcp-config.json and mdm-config.json files
  install-schedule    Install system scheduled task (launchd/systemd/Task Scheduler)
  uninstall-schedule  Remove system scheduled task
  uninstall           Uninstall (removes schedule; binary/config must be removed manually)

Flags:
  -h, --help              Show this help message
      --version           Show version
      --dry-run           Simulate without making changes
      --user <name>       Configure a single user instead of all users
      --skip-update       Skip binary self-update check
      --mcp-config <path> Custom path to MCP config file
      --mdm-config <path> Custom path to MDM config file

Config flags (used with 'config' command):
      --server-name <name>        Identifier for the MCP server (required)
      --server-url <url>          MCP server endpoint URL (required)
      --auto-update               Enable automatic binary updates
      --no-auto-update            Disable automatic binary updates
      --version-url <url>         URL to fetch latest version info
      --binary-url-prefix <url>   Base URL for downloading binaries (required)
      --pinned-version <version>  Pin to a specific version
      --output-dir <path>         Directory to write config files to
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.showVersion) {
    process.stdout.write(`${BUILD_VERSION}\n`)
    return
  }

  if (args.showHelp || !args.subcommand) {
    printHelp()
    return
  }

  initLogger()
  log.info(`glean-mdm ${BUILD_VERSION}`)

  if (args.subcommand === 'install-schedule') {
    installSchedule()
    return
  }
  if (args.subcommand === 'uninstall-schedule') {
    uninstallSchedule()
    return
  }
  if (args.subcommand === 'uninstall') {
    uninstallSchedule()
    log.info('Uninstall complete (binary and config must be removed manually)')
    return
  }
  if (args.subcommand === 'config') {
    if (!args.serverName) {
      process.stderr.write('Error: --server-name is required for config subcommand\n')
      process.exit(1)
    }
    if (!args.serverUrl) {
      process.stderr.write('Error: --server-url is required for config subcommand\n')
      process.exit(1)
    }
    if (args.autoUpdate === undefined) {
      process.stderr.write('Error: --auto-update or --no-auto-update is required for config subcommand\n')
      process.exit(1)
    }
    if (!args.binaryUrlPrefix) {
      process.stderr.write('Error: --binary-url-prefix is required for config subcommand\n')
      process.exit(1)
    }
    try {
      writeConfig({
        serverName: args.serverName,
        serverUrl: args.serverUrl,
        autoUpdate: args.autoUpdate,
        versionUrl: args.versionUrl,
        binaryUrlPrefix: args.binaryUrlPrefix,
        pinnedVersion: args.pinnedVersion,
        outputDir: args.outputDir,
      })
    } catch (err) {
      if (err instanceof ZodError) {
        process.stderr.write(`Validation error: ${err.issues.map((i) => i.message).join(', ')}\n`)
        process.exit(1)
      }
      throw err
    }
    return
  }

  // subcommand === 'setup'
  const mcpConfig = readMcpConfig(args.mcpConfigPath)
  const mdmConfig = readMdmConfig(args.mdmConfigPath)

  for (const server of mcpConfig.servers) {
    log.info(`Server: ${server.serverName} (${getServerUrl(server)})`)
  }

  if (!args.skipUpdate && mdmConfig.autoUpdate) {
    await checkForUpdate(mdmConfig.versionUrl!, mdmConfig.binaryUrlPrefix, mdmConfig.pinnedVersion)
  } else if (!mdmConfig.autoUpdate) {
    log.info('Auto-update disabled by configuration')
  }

  let users
  if (args.singleUser) {
    const user = lookupUser(args.singleUser)
    if (!user) {
      log.error(`User not found: ${args.singleUser}`)
      process.exit(1)
    }
    users = [user]
  } else {
    users = enumerateUsers()
  }

  log.info(`Found ${users.length} user(s)`)

  let totalSuccess = 0
  let totalFailure = 0

  for (const user of users) {
    log.info(`Configuring hosts for ${user.username} (${user.homeDir})`)

    const results = configureHosts({
      servers: mcpConfig.servers,
      dryRun: args.dryRun,
      gid: user.gid,
      uid: user.uid,
      userHomeDir: user.homeDir,
      username: user.username,
    })

    for (const result of results) {
      if (result.success) totalSuccess++
      else totalFailure++
    }
  }

  log.info(`Done: ${totalSuccess} configured, ${totalFailure} failed`)

  if (totalFailure > 0) {
    process.exit(1)
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  decodeURIComponent(import.meta.url).endsWith(process.argv[1].replace(/\\/g, '/'))

if (isDirectExecution) {
  main().catch((err) => {
    log.error(`Fatal: ${err}`)
    process.exit(1)
  })
}
