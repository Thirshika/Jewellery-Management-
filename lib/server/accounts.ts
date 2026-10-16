import 'server-only'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { getDatabase } from '@/lib/server/database'
import type { AccountIdentifier } from '@/lib/auth-validation'
import type { Account } from '@/lib/account-types'
const PASSWORD_HASH_BYTES = 64

function derivePasswordHash(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, PASSWORD_HASH_BYTES, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export async function createAccount(displayName: string, identifier: AccountIdentifier, password: string): Promise<Account> {
  const salt = randomBytes(16)
  const passwordHash = await derivePasswordHash(password, salt)
  const client = await getDatabase().connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [2_026_1016, 7])
    const legacy = await client.query<{ id: string }>(
      `SELECT id FROM workspaces
       WHERE is_legacy AND legacy_claimed_at IS NULL
       FOR UPDATE`,
    )
    let workspaceId = legacy.rows[0]?.id
    const isLegacyWorkspace = Boolean(workspaceId)
    if (workspaceId) {
      await client.query('UPDATE workspaces SET legacy_claimed_at = NOW() WHERE id = $1', [workspaceId])
    } else {
      const workspace = await client.query<{ id: string }>(
        `INSERT INTO workspaces (name)
         VALUES ('Jewellery Workspace')
         RETURNING id`,
      )
      workspaceId = workspace.rows[0].id
    }
    const result = await client.query<Account>(
      `INSERT INTO user_accounts (workspace_id, display_name, email, phone, password_salt, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, workspace_id AS "workspaceId", display_name AS "displayName", email, phone`,
      [workspaceId, displayName, identifier.email, identifier.phone, salt.toString('base64url'), passwordHash.toString('base64url')],
    )
    await client.query('COMMIT')
    return { ...result.rows[0], isLegacyWorkspace }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function authenticateAccount(identifier: AccountIdentifier, password: string): Promise<Account | null> {
  const column = identifier.email ? 'email' : 'phone'
  const value = identifier.email ?? identifier.phone
  const result = await getDatabase().query<Account & { passwordSalt: string; passwordHash: string }>(
    `SELECT a.id, a.workspace_id AS "workspaceId", w.is_legacy AS "isLegacyWorkspace",
       a.display_name AS "displayName", a.email, a.phone,
       a.password_salt AS "passwordSalt", a.password_hash AS "passwordHash"
     FROM user_accounts a
     JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.${column} = $1`,
    [value],
  )

  if (!result.rows[0]) {
    await derivePasswordHash(password, Buffer.alloc(16))
    return null
  }

  const account = result.rows[0]
  const salt = Buffer.from(account.passwordSalt, 'base64url')
  const expected = Buffer.from(account.passwordHash, 'base64url')
  const supplied = await derivePasswordHash(password, salt)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
    ? {
        id: account.id,
        workspaceId: account.workspaceId,
        isLegacyWorkspace: account.isLegacyWorkspace,
        displayName: account.displayName,
        email: account.email,
        phone: account.phone,
      }
    : null
}

export async function getAccountById(id: string): Promise<Account | null> {
  const result = await getDatabase().query<Account>(
    `SELECT a.id, a.workspace_id AS "workspaceId", w.is_legacy AS "isLegacyWorkspace",
       a.display_name AS "displayName", a.email, a.phone
     FROM user_accounts a
     JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = $1`,
    [id],
  )
  return result.rows[0] ?? null
}
