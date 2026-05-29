// Snapshot generator: serializes the @gleanwork/mcp-config-schema registry into
// a flat registry.json that the Go binary embeds with go:embed.
//
// The npm package remains the single source of truth. This script captures, for
// every userConfigurable client that supports the HTTP transport, the exact
// server-entry object that buildConfiguration() produces (including per-client
// default fields the data files don't expose), using placeholder tokens that
// the Go runtime substitutes with the real server name and URL.
//
// Run via `npm run generate` in this directory (CI gates on the result being
// up to date with the pinned dependency).

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createGleanRegistry } from '@gleanwork/mcp-config-glean'

// The server-name sentinel is intentionally already "glean_"-prefixed so the
// registry's name normalization is a no-op and the token survives verbatim
// (including where clients embed the name inside the entry, e.g. Goose's
// `name` field). The Go runtime replaces this token with the normalized server
// name. The URL sentinel is substituted with the real server URL.
const SERVER_NAME_PLACEHOLDER = 'glean_GLEANMDMSERVERNAMETOKEN'
const SERVER_URL_PLACEHOLDER = '__GLEAN_SERVER_URL__'

// Must match the header injected by configureHosts in the original code.
const MDM_HEADERS = { 'X-Glean-Metadata': 'mdm' }

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'internal', 'registry', 'registry.json')

const registry = createGleanRegistry()
const allConfigs = registry.getAllConfigs()

// Collect every URL property name used across all clients (used by the Go
// dedup logic, mirroring getAllUrlPropertyNames in hosts/utils.ts).
const urlPropertyNames = new Set()
for (const config of allConfigs) {
  const urlProperty = config.configStructure?.httpPropertyMapping?.urlProperty
  if (urlProperty) urlPropertyNames.add(urlProperty)
}

const clients = []
for (const config of allConfigs) {
  // configureHosts only touches clients that are user-configurable and speak HTTP.
  if (!config.userConfigurable) continue
  if (!Array.isArray(config.transports) || !config.transports.includes('http')) continue

  const builder = registry.createBuilder(config.id)
  const partial = builder.buildConfiguration({
    transport: 'http',
    includeRootObject: false,
    serverName: SERVER_NAME_PLACEHOLDER,
    serverUrl: SERVER_URL_PLACEHOLDER,
    headers: { ...MDM_HEADERS },
  })

  // The registry normalizes/prefixes the server name (e.g. "glean_<name>"), so
  // the key is not the literal placeholder. There is exactly one entry; take its value.
  const entries = Object.values(partial)
  if (entries.length !== 1) {
    throw new Error(`Unexpected buildConfiguration output for ${config.id}: ${JSON.stringify(partial)}`)
  }
  const entryTemplate = entries[0]

  clients.push({
    id: config.id,
    displayName: config.displayName,
    configFormat: config.configFormat,
    serversPropertyName: config.configStructure?.serversPropertyName ?? null,
    urlProperty: config.configStructure?.httpPropertyMapping?.urlProperty ?? null,
    configPath: {
      darwin: config.configPath?.darwin ?? null,
      linux: config.configPath?.linux ?? null,
      win32: config.configPath?.win32 ?? null,
    },
    entryTemplate,
  })
}

clients.sort((a, b) => a.id.localeCompare(b.id))

const output = {
  // Provenance so the snapshot is auditable.
  generatedFrom: '@gleanwork/mcp-config-glean',
  serverNamePlaceholder: SERVER_NAME_PLACEHOLDER,
  serverUrlPlaceholder: SERVER_URL_PLACEHOLDER,
  urlPropertyNames: [...urlPropertyNames].sort(),
  clients,
}

writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n')
console.log(`Wrote ${clients.length} clients to ${OUT_PATH}`)
