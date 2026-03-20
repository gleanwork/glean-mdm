import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, beforeEach } from 'vitest'

import { initLogger, log } from './logger'

const TIMESTAMP_PATTERN = /\[\d{4}-\d{2}-\d{2}T/

describe('logger', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mdm-logger-test-'))
  })

  it('writes log entries to file after initLogger', () => {
    const logPath = join(tempDir, 'test.log')
    initLogger(logPath)

    log.info('test message')

    const content = readFileSync(logPath, 'utf-8')

    expect(content).toContain('[INFO] test message')
  })

  it('includes timestamp in log entries', () => {
    const logPath = join(tempDir, 'test.log')
    initLogger(logPath)

    log.info('timestamped')

    const content = readFileSync(logPath, 'utf-8')

    expect(content).toMatch(TIMESTAMP_PATTERN)
  })

  it('supports different log levels', () => {
    const logPath = join(tempDir, 'test.log')
    initLogger(logPath)

    log.info('info msg')
    log.warn('warn msg')
    log.error('error msg')

    const content = readFileSync(logPath, 'utf-8')

    expect(content).toContain('[INFO] info msg')
    expect(content).toContain('[WARN] warn msg')
    expect(content).toContain('[ERROR] error msg')
  })

  it('truncates log file when it exceeds 10MB', () => {
    const logPath = join(tempDir, 'big.log')
    const bigContent = 'x'.repeat(11 * 1024 * 1024)
    writeFileSync(logPath, bigContent)

    initLogger(logPath)

    const content = readFileSync(logPath, 'utf-8')

    expect(content.length).toBe(0)
  })

  it('does not truncate log file under 10MB', () => {
    const logPath = join(tempDir, 'small.log')
    writeFileSync(logPath, 'existing content\n')

    initLogger(logPath)
    log.info('appended')

    const content = readFileSync(logPath, 'utf-8')

    expect(content).toContain('existing content')
    expect(content).toContain('appended')
  })
})
