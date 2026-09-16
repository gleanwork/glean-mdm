import { Command } from 'commander'
import { ZodError } from 'zod'

import { writeConfig } from './config-writer.js'
import { initLogger, log } from './logger.js'
import { withRunLock } from './run-lock.js'
import { installSchedule, uninstallSchedule } from './scheduler.js'
import { fullUninstall } from './uninstaller.js'
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
  log.warn('glean-mdm is deprecated. Use glean-helper for new MDM deployments.')
  log.info('Retiring the legacy schedule only; keeping the binary, configuration, logs, and editor extensions.')

  // Do not read legacy configs or self-update. In particular, --skip-update is
  // passed by the updating parent and must not suppress schedule retirement.
  // Unloading our own macOS job can terminate this process, so do this last.
  uninstallSchedule({ dryRun: options.dryRun })
}

async function executeInstallSchedule(options: CliOptions): Promise<void> {
  installSchedule()
}

async function executeUninstallSchedule(options: CliOptions): Promise<void> {
  uninstallSchedule({ dryRun: options.dryRun })
}

async function executeUninstall(options: CliOptions): Promise<void> {
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

export function setupProgram(): Command {
  const program = new Command()

  program
    .name('glean-mdm')
    .version(BUILD_VERSION)
    .description('Deprecated: retire the legacy Glean MDM schedule. Use glean-helper for new deployments.')

  // Global options
  program
    .option('--dry-run', 'Simulate without making changes', false)
    .option('--user <name>', 'Legacy compatibility flag (ignored; retirement is machine-wide)')
    .option('--skip-update', 'Legacy compatibility flag (this release never self-updates)', false)
    .option('--mcp-config <path>', 'Legacy compatibility flag (run does not read MCP config)')
    .option('--mdm-config <path>', 'Legacy compatibility flag (run does not read MDM config)')

  // run command
  program
    .command('run')
    .description('Retire the system schedule, preserving the binary and existing configuration')
    .action(async (cmdOptions, command) => {
      const globalOpts = command.parent?.opts() || {}
      const options = buildCliOptions('run', globalOpts)
      await withRunLock(() => executeRun(options))
    })

  // install-schedule command
  program
    .command('install-schedule')
    .description('Deprecated no-op: schedules can no longer be installed')
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
