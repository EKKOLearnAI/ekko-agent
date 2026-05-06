import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production'
}

function resolveProjectRoot(): string {
  return resolve(process.cwd(), '..')
}

function resolveDataDir(): string {
  if (!isDevEnvironment()) {
    return resolve(homedir(), '.ekko-agent')
  }

  return resolve(resolveProjectRoot(), '.ekko-agent')
}

export const serverConfig = {
  host: '127.0.0.1',
  port: 18654,
} as const

export const runtimeConfig = {
  isDev: isDevEnvironment(),
} as const

export const storageConfig = {
  dataDir: resolveDataDir(),
} as const

export const pathsConfig = {
  dbPath: resolve(storageConfig.dataDir, 'ekko-agent.db'),
} as const

export function initConfig(): void {
  mkdirSync(storageConfig.dataDir, { recursive: true })
}
