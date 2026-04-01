import { appendFileSync, statSync, writeFileSync } from 'node:fs'

import { getLogFilePath } from './platform.js'

const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB

let logFilePath: string | null = null

export function initLogger(path?: string): void {
  logFilePath = path ?? getLogFilePath()
  try {
    const stats = statSync(logFilePath)
    if (stats.size > MAX_LOG_SIZE) {
      writeFileSync(logFilePath, '')
    }
  } catch {
    // File doesn't exist yet
  }
}

function write(level: string, message: string): void {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level}] ${message}\n`
  if (process.stdout.isTTY) {
    process.stdout.write(line)
  }
  if (logFilePath) {
    try {
      appendFileSync(logFilePath, line)
    } catch {
      // Can't write to log file, fall back to stdout
      if (!process.stdout.isTTY) {
        process.stdout.write(line)
      }
    }
  }
}

export const log = {
  error: (msg: string) => write('ERROR', msg),
  info: (msg: string) => write('INFO', msg),
  warn: (msg: string) => write('WARN', msg),
}
