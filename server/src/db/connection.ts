import { DatabaseSync } from 'node:sqlite'
import { pathsConfig, runtimeConfig, storageConfig } from '../utils/config'

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(pathsConfig.dbPath)

    if (runtimeConfig.isDev) {
      db.exec('PRAGMA journal_mode=DELETE')
    } else {
      db.exec('PRAGMA journal_mode=WAL')
      db.exec('PRAGMA synchronous=NORMAL')
      db.exec('PRAGMA busy_timeout=5000')
      db.exec('PRAGMA foreign_keys=ON')
    }
  }

  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

export function getStoragePath(): string {
  return pathsConfig.dbPath
}
