import YAML from 'yaml'

import { type ConfigureFileOptions, configureManagedFile } from './managed-config.js'

export function configureYamlFile(options: ConfigureFileOptions): void {
  configureManagedFile(options, {
    format: 'YAML',
    parse: (content) => YAML.parse(content) ?? {},
    serialize: YAML.stringify,
  })
}
