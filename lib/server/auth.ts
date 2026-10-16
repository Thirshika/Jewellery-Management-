import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'suvarna_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 12

export class AuthConfigurationError extends Error {}

function getSessionSecret(): string {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new AuthConfigurationError(
      'Set APP_SESSION_SECRET to a random value at least 32 characters long.',
    )
  }
  return secret
}

export function assertSessionConfiguration(): void {
  getSessionSecret()
}

function signSession(accountId: string, workspaceId: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`kanthimathi-workspace:${accountId}:${workspaceId}:${expiresAt}`)
    .digest('base64url')
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getSessionClaims(token: string | undefined): { accountId: string; workspaceId: string } | null {
  if (!token) return null

  try {
    const secret = getSessionSecret()
    const [accountId, workspaceId, expiresAtText, signature, ...extra] = token.split('.')
    const expiresAt = Number(expiresAtText)
    if (
      extra.length ||
      !UUID_PATTERN.test(accountId ?? '') ||
      !UUID_PATTERN.test(workspaceId ?? '') ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }

    const expected = Buffer.from(signSession(accountId, workspaceId, expiresAt, secret))
    const actual = Buffer.from(signature ?? '')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
      ? { accountId, workspaceId }
      : null
  } catch (error) {
    if (error instanceof AuthConfigurationError) return null
    throw error
  }
}

export function getSessionAccountId(token: string | undefined): string | null {
  return getSessionClaims(token)?.accountId ?? null
}

export function getSessionWorkspaceId(token: string | undefined): string | null {
  return getSessionClaims(token)?.workspaceId ?? null
}

export function verifySessionToken(token: string | undefined): boolean {
  return getSessionClaims(token) !== null
}

function getRequestSessionToken(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie') ?? ''
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
}

export function getAuthenticatedWorkspaceId(request: Request): string | null {
  return getSessionWorkspaceId(getRequestSessionToken(request))
}

export function createSessionCookie(accountId: string, workspaceId: string): string {
  const secret = getSessionSecret()
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  const signature = signSession(accountId, workspaceId, expiresAt, secret)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${accountId}.${workspaceId}.${expiresAt}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure}`
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
}
