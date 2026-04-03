import { Command } from 'commander'
import { ZodError } from 'zod'

import { getServerUrl, readMcpConfig, readMdmConfig } from './config.js'
import { writeConfig } from './config-writer.js'
import { installExtensions } from './extensions/index.js'
import { configureHosts } from './hosts/index.js'
import { initLogger, log } from './logger.js'
import { requireAdminPrivileges } from './privileges.js'
import { installSchedule, uninstallSchedule } from './scheduler.js'
import { fullUninstall } from './uninstaller.js'
import { checkForUpdate } from './updater.js'
import { enumerateUsers, getActiveSessionUsers, lookupUser } from './users.js'
import { BUILD_VERSION } from './version.js'

export interface CliOptions {
  mcpConfigPath?: string
  mdmConfigPath?: string
  dryRun: boolean
  singleUser?: string
  skipUpdate: boolean
  subcommand?: 'run' | 'install-schedule' | 'uninstall-schedule' | 'uninstall' | 'config'
  serverName?: string
  serverUrl?: string
  autoUpdate?: boolean
  versionUrl?: string
  binaryUrlPrefix?: string
  pinnedVersion?: string
  outputDir?: string
  keepConfig?: boolean
}

export function buildCliOptions(
  subcommand: CliOptions['subcommand'],
  globalOpts: any,
  cmdOpts: any = {},
): CliOptions {
  return {
    subcommand,
    dryRun: globalOpts.dryRun ?? false,
    skipUpdate: globalOpts.skipUpdate ?? false,
    mcpConfigPath: globalOpts.mcpConfig,
    mdmConfigPath: globalOpts.mdmConfig,
    singleUser: globalOpts.user,

    // config command options
    serverName: cmdOpts.serverName,
    serverUrl: cmdOpts.serverUrl,
    autoUpdate: cmdOpts.autoUpdate,
    versionUrl: cmdOpts.versionUrl,
    binaryUrlPrefix: cmdOpts.binaryUrlPrefix,
    pinnedVersion: cmdOpts.pinnedVersion,
    outputDir: cmdOpts.outputDir,

    // uninstall command options
    keepConfig: cmdOpts.keepConfig ?? false,
  }
}

async function executeRun(options: CliOptions): Promise<void> {
  requireAdminPrivileges('run')

  const mcpConfig = readMcpConfig(options.mcpConfigPath)
  const mdmConfig = readMdmConfig(options.mdmConfigPath)

  for (const server of mcpConfig.servers) {
    log.info(`Server: ${server.serverName} (${getServerUrl(server)})`)
  }

  if (!options.skipUpdate && mdmConfig.autoUpdate) {
    await checkForUpdate(mdmConfig.versionUrl!, mdmConfig.binaryUrlPrefix, mdmConfig.pinnedVersion)
  } else if (!mdmConfig.autoUpdate) {
    log.info('Auto-update disabled by configuration')
  }

  let users
  if (options.singleUser) {
    const user = lookupUser(options.singleUser)
    if (!user) {
      log.error(`User not found: ${options.singleUser}`)
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
      dryRun: options.dryRun,
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

  log.info(`Hosts: ${totalSuccess} configured, ${totalFailure} failed`)

  let extensionSuccess = 0
  let extensionFailure = 0

  const activeUsers = getActiveSessionUsers()
  if (activeUsers === null) {
    log.warn('Could not determine active sessions; installing extensions for all users')
  }

  for (const user of users) {
    if (activeUsers !== null && !activeUsers.has(user.username)) {
      log.info(`Skipping extensions for ${user.username} (no active session)`)
      continue
    }

    log.info(`Installing extensions for ${user.username} (${user.homeDir})`)

    const extResults = installExtensions({
      dryRun: options.dryRun,
      gid: user.gid,
      uid: user.uid,
      userHomeDir: user.homeDir,
      username: user.username,
    })

    for (const result of extResults) {
      if (result.skipped) continue
      if (result.success) extensionSuccess++
      else extensionFailure++
    }
  }

  log.info(`Extensions: ${extensionSuccess} installed, ${extensionFailure} failed`)

  if (totalFailure > 0 || extensionFailure > 0) {
    process.exit(1)
  }
}

async function executeInstallSchedule(options: CliOptions): Promise<void> {
  requireAdminPrivileges('install-schedule')
  installSchedule()
}

async function executeUninstallSchedule(options: CliOptions): Promise<void> {
  requireAdminPrivileges('uninstall-schedule')
  uninstallSchedule()
}

async function executeUninstall(options: CliOptions): Promise<void> {
  requireAdminPrivileges('uninstall')
  fullUninstall({ keepConfig: options.keepConfig })
}

async function executeConfig(options: CliOptions): Promise<void> {
  try {
    writeConfig({
      serverName: options.serverName!,
      serverUrl: options.serverUrl!,
      autoUpdate: options.autoUpdate!,
      versionUrl: options.versionUrl,
      binaryUrlPrefix: options.binaryUrlPrefix!,
      pinnedVersion: options.pinnedVersion,
      outputDir: options.outputDir,
    })
  } catch (err) {
    if (err instanceof ZodError) {
      process.stderr.write(`Validation error: ${err.issues.map((i) => i.message).join(', ')}\n`)
      process.exit(1)
    }
    throw err
  }
}

function setupProgram(): Command {
  const program = new Command()

  program
    .name('glean-mdm')
    .version(BUILD_VERSION)
    .description('Configure MCP servers across AI coding tools on managed devices.')

  // Global options
  program
    .option('--dry-run', 'Simulate without making changes', false)
    .option('--user <name>', 'Configure a single user instead of all users')
    .option('--skip-update', 'Skip binary self-update check', false)
    .option('--mcp-config <path>', 'Custom path to MCP config file')
    .option('--mdm-config <path>', 'Custom path to MDM config file')

  // run command
  program
    .command('run')
    .description('Run host configuration for all users')
    .action(async (cmdOptions, command) => {
      const globalOpts = command.parent?.opts() || {}
      const options = buildCliOptions('run', globalOpts)
      await executeRun(options)
    })

  // install-schedule command
  program
    .command('install-schedule')
    .description('Install system scheduled task (launchd/systemd/Task Scheduler)')
    .action(async (cmdOptions, command) => {
      const globalOpts = command.parent?.opts() || {}
      const options = buildCliOptions('install-schedule', globalOpts)
      await executeInstallSchedule(options)
    })

  // uninstall-schedule command
  program
    .command('uninstall-schedule')
    .description('Remove system scheduled task')
    .action(async (cmdOptions, command) => {
      const globalOpts = command.parent?.opts() || {}
      const options = buildCliOptions('uninstall-schedule', globalOpts)
      await executeUninstallSchedule(options)
    })

  // uninstall command
  program
    .command('uninstall')
    .description('Full uninstall (removes schedule, config, logs, and binary)')
    .option('--keep-config', 'Preserve config files during uninstall', false)
    .action(async (cmdOptions, command) => {
      const globalOpts = command.parent?.opts() || {}
      const options = buildCliOptions('uninstall', globalOpts, cmdOptions)
      await executeUninstall(options)
    })

  // config command
  program
    .command('config')
    .description('Generate mcp-config.json and mdm-config.json files')
    .requiredOption('--server-name <name>', 'Identifier for the MCP server')
    .requiredOption('--server-url <url>', 'MCP server endpoint URL')
    .option('--auto-update', 'Enable automatic binary updates')
    .option('--no-auto-update', 'Disable automatic binary updates')
    .option('--version-url <url>', 'URL to fetch latest version info')
    .requiredOption('--binary-url-prefix <url>', 'Base URL for downloading binaries')
    .option('--pinned-version <version>', 'Pin to a specific version')
    .option('--output-dir <path>', 'Directory to write config files to')
    .action(async (cmdOptions, command) => {
      const globalOpts = command.parent?.opts() || {}

      // Additional validation for autoUpdate (must be explicitly set)
      if (cmdOptions.autoUpdate === undefined) {
        console.error('Error: --auto-update or --no-auto-update is required for config subcommand')
        process.exit(1)
      }

      const options = buildCliOptions('config', globalOpts, cmdOptions)
      await executeConfig(options)
    })

  return program
}

async function main(): Promise<void> {
  const program = setupProgram()

  // If no arguments provided, show help
  if (process.argv.length === 2) {
    program.outputHelp()
    return
  }

  // Initialize logger before executing any command
  // Skip for --help/-h/--version since Commander handles these
  const args = process.argv.slice(2)
  const isHelpOrVersion = args.includes('--help') || args.includes('-h') || args.includes('--version')

  if (!isHelpOrVersion) {
    initLogger()
    log.info(`glean-mdm ${BUILD_VERSION}`)
  }

  // Parse and execute
  await program.parseAsync(process.argv)
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
