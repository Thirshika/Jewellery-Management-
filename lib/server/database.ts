import 'server-only'
import { Pool } from 'pg'

const globalForDatabase = globalThis as typeof globalThis & {
  suvarnaDatabasePool?: Pool
}

export function getDatabase(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.')
  }

  if (!globalForDatabase.suvarnaDatabasePool) {
    const pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    })
    pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error:', error)
    })
    globalForDatabase.suvarnaDatabasePool = pool
  }

  return globalForDatabase.suvarnaDatabasePool
}
