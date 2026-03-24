import { getBackendUrl, getServerUrl, readMdmConfig } from './config.js'
import { configureHosts } from './hosts/index.js'
import { initLogger, log } from './logger.js'
import { installSchedule, uninstallSchedule } from './scheduler.js'
import { checkForUpdate } from './updater.js'
import { enumerateUsers, lookupUser } from './users.js'
import { BUILD_VERSION } from './version.js'

export interface CliOptions {
  configPath?: string
  dryRun: boolean
  showVersion: boolean
  singleUser?: string
  skipUpdate: boolean
  subcommand?: 'install-schedule' | 'uninstall-schedule' | 'uninstall'
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    showVersion: false,
    skipUpdate: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--config':
        options.configPath = args[++i]
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
      case '--version':
        options.showVersion = true
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
    }
  }

  return options
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.showVersion) {
    process.stdout.write(`${BUILD_VERSION}\n`)
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

  const configs = readMdmConfig(args.configPath)

  // Run auto-update using the first config entry
  const primaryConfig = configs[0]
  if (!args.skipUpdate && primaryConfig.autoUpdate) {
    await checkForUpdate(getBackendUrl(primaryConfig.url), primaryConfig.binaryUrlPrefix, primaryConfig.pinnedVersion)
  } else if (!primaryConfig.autoUpdate) {
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

  log.info(`Found ${users.length} user(s), ${configs.length} server(s)`)

  let totalSuccess = 0
  let totalFailure = 0

  for (const config of configs) {
    log.info(`Server: ${config.serverName} (${getServerUrl(config)})`)

    for (const user of users) {
      log.info(`Configuring hosts for ${user.username} (${user.homeDir})`)

      const results = configureHosts({
        config,
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
