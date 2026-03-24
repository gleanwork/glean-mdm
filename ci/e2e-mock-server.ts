import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'binary-path': { type: 'string' },
    'port-file': { type: 'string' },
    version: { type: 'string' },
  },
})

const binaryPath = values['binary-path']
const portFile = values['port-file']
const version = values['version'] ?? '99.0.0'

if (!binaryPath || !portFile) {
  console.error('Usage: e2e-mock-server.ts --binary-path <path> --port-file <path> [--version <ver>]')
  process.exit(1)
}

const binaryData = readFileSync(binaryPath)
const sha256 = createHash('sha256').update(binaryData).digest('hex')
const checksum = `sha256:${sha256}`

console.log(`Binary: ${binaryPath} (${binaryData.length} bytes)`)
console.log(`Checksum: ${checksum}`)
console.log(`Version: ${version}`)

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(req) {
    const url = new URL(req.url)
    console.log(`${req.method} ${url.pathname}${url.search}`)

    if (url.pathname === '/api/v1/mdm/version') {
      const targets = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'windows-x64']
      const checksums: Record<string, string> = {}
      for (const t of targets) checksums[t] = checksum
      return Response.json({ checksums, version })
    }

    if (url.pathname.startsWith('/static/mdm/binaries/')) {
      return new Response(binaryData, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
    }

    console.log(`404: ${url.pathname}`)
    return new Response('Not Found', { status: 404 })
  },
})

const port = server.port
console.log(`Listening on port ${port}`)
writeFileSync(portFile, String(port))

function shutdown() {
  console.log('Shutting down mock server')
  server.stop()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
