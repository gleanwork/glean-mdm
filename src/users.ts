import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { log } from './logger.js'
import { getPlatform } from './platform.js'

const WHITESPACE = /\s+/
const NFS_HOME_DIR = /NFSHomeDirectory:\s*(.+)/
const PRIMARY_GROUP_ID = /PrimaryGroupID:\s*(\d+)/

export interface UserInfo {
  gid?: number
  homeDir: string
  uid?: number
  username: string
}

function getDarwinUsers(): UserInfo[] {
  const output = execSync('dscl . -list /Users UniqueID', {
    encoding: 'utf-8',
  })
  const users: UserInfo[] = []

  for (const line of output.trim().split('\n')) {
    const parts = line.trim().split(WHITESPACE)
    if (parts.length < 2) continue
    const username = parts[0]
    const uid = parseInt(parts[1], 10)
    if (uid < 500) continue

    try {
      const homeOutput = execSync(`dscl . -read /Users/${username} NFSHomeDirectory`, { encoding: 'utf-8' })
      const homeMatch = homeOutput.match(NFS_HOME_DIR)
      if (!homeMatch) continue
      const homeDir = homeMatch[1].trim()

      const gidOutput = execSync(`dscl . -read /Users/${username} PrimaryGroupID`, { encoding: 'utf-8' })
      const gidMatch = gidOutput.match(PRIMARY_GROUP_ID)
      const gid = gidMatch ? parseInt(gidMatch[1], 10) : uid

      users.push({ gid, homeDir, uid, username })
    } catch {
      // Skip users we can't read
    }
  }

  return users
}

function getLinuxUsers(): UserInfo[] {
  const output = execSync('getent passwd', { encoding: 'utf-8' })
  const users: UserInfo[] = []

  for (const line of output.trim().split('\n')) {
    const parts = line.split(':')
    if (parts.length < 7) continue
    const [username, , uidStr, gidStr, , homeDir, shell] = parts
    const uid = parseInt(uidStr, 10)
    const gid = parseInt(gidStr, 10)

    if (uid < 1000) continue
    if (shell.includes('nologin') || shell.includes('false')) continue

    users.push({ gid, homeDir, uid, username })
  }

  return users
}

function getWindowsUsers(): UserInfo[] {
  const usersDir = 'C:\\Users'
  const excludeDirs = new Set(['Public', 'Default', 'Default User', 'defaultuser0', 'All Users'])
  const users: UserInfo[] = []

  try {
    const entries = readdirSync(usersDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (excludeDirs.has(entry.name)) continue

      users.push({
        homeDir: join(usersDir, entry.name),
        username: entry.name,
      })
    }
  } catch {
    log.error('Failed to enumerate Windows users')
  }

  return users
}

export function enumerateUsers(): UserInfo[] {
  switch (getPlatform()) {
    case 'darwin':
      return getDarwinUsers()
    case 'linux':
      return getLinuxUsers()
    case 'win32':
      return getWindowsUsers()
  }
}

export function lookupUser(username: string): UserInfo | undefined {
  const users = enumerateUsers()
  return users.find((u) => u.username === username)
}
