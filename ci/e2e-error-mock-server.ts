import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'port-file': { type: 'string' },
    'version-status': { type: 'string', default: '200' },
    'binary-status': { type: 'string', default: '200' },
  },
})

const portFile = values['port-file']
const versionStatus = Number(values['version-status'])
const binaryStatus = Number(values['binary-status'])

if (!portFile) {
  console.error('Usage: e2e-error-mock-server.ts --port-file <path> [--version-status <code>] [--binary-status <code>]')
  process.exit(1)
}

console.log(`Version endpoint status: ${versionStatus}`)
console.log(`Binary endpoint status: ${binaryStatus}`)

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(req) {
    const url = new URL(req.url)
    console.log(`${req.method} ${url.pathname}${url.search}`)

    if (url.pathname === '/api/v1/mdm/version') {
      if (versionStatus !== 200) {
        return new Response('Simulated error', { status: versionStatus })
      }
      const targets = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'windows-x64']
      const checksums: Record<string, string> = {}
      for (const t of targets) checksums[t] = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
      return Response.json({ checksums, version: '99.0.0' })
    }

    if (url.pathname.startsWith('/static/mdm/binaries/')) {
      if (binaryStatus !== 200) {
        return new Response('Simulated error', { status: binaryStatus })
      }
      return new Response('dummy-binary-data', {
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
