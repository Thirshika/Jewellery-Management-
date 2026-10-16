import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { Client } from 'pg'

if (!process.env.DATABASE_URL?.trim()) {
  delete process.env.DATABASE_URL
  for (const candidate of ['.env.production.local', '.env.local']) {
    if (!existsSync(candidate)) continue
    process.loadEnvFile(candidate)
    if (process.env.DATABASE_URL?.trim()) break
    delete process.env.DATABASE_URL
  }
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required. Set it in the environment or an ignored local env file.')
  process.exit(1)
}

const migrationsDirectory = resolve('database', 'migrations')
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
  .sort((left, right) => left.localeCompare(right, 'en'))

if (migrationFiles.length === 0) {
  console.error('No SQL migration files were found in database/migrations.')
  process.exit(1)
}

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 10_000,
  application_name: 'jewellery-management-migrations',
})

try {
  await client.connect()
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  for (const file of migrationFiles) {
    await client.query('BEGIN')
    try {
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [2_026_1015, 1])
      const applied = await client.query(
        'SELECT 1 FROM public.schema_migrations WHERE version = $1',
        [file],
      )
      if (applied.rowCount) {
        await client.query('COMMIT')
        console.log(`Already applied: ${file}`)
        continue
      }

      const sql = await readFile(resolve(migrationsDirectory, file), 'utf8')
      await client.query(sql)
      await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`Applied: ${file}`)
    } catch (error) {
      await client.query('ROLLBACK')
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined
      console.error(
        `Migration failed: ${file}${code ? ` (PostgreSQL SQLSTATE ${code})` : ''}. ` +
          'Its transaction was rolled back; existing rows were not deleted.',
      )
      process.exitCode = 1
      break
    }
  }
} catch (error) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined
  console.error(
    `Could not connect to PostgreSQL or initialize the migration runner${code ? ` (SQLSTATE ${code})` : ''}. ` +
      'Check DATABASE_URL and database access; the connection string is not logged.',
  )
  process.exitCode = 1
} finally {
  await client.end().catch(() => {
    process.exitCode = 1
    console.error('Could not close the PostgreSQL migration connection cleanly.')
  })
}
