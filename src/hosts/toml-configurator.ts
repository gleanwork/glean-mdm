import * as TOML from 'smol-toml'

import { type ConfigureFileOptions, configureManagedFile } from './managed-config.js'

export function configureTomlFile(options: ConfigureFileOptions): void {
  configureManagedFile(options, {
    format: 'TOML',
    parse: TOML.parse,
    serialize: TOML.stringify,
  })
}
