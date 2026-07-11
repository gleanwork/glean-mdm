import { type ConfigureFileOptions, configureManagedFile } from './managed-config.js'

export function configureJsonFile(options: ConfigureFileOptions): void {
  configureManagedFile(options, {
    format: 'JSON',
    parse: JSON.parse,
    serialize: (config) => JSON.stringify(config, null, 2) + '\n',
  })
}
