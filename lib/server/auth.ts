import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

export const SESSION_COOKIE = 'suvarna_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 12

export class AuthConfigurationError extends Error {}

export function isAuthEnabled(): boolean {
  return process.env.APP_AUTH_ENABLED === 'true'
}

function getAuthConfiguration() {
  const password = process.env.APP_PASSWORD
  const secret = process.env.APP_SESSION_SECRET
  if (!password || password.length < 12 || !secret || secret.length < 32) {
    throw new AuthConfigurationError(
      'Set APP_PASSWORD (at least 12 characters) and APP_SESSION_SECRET (at least 32 characters).',
    )
  }
  return { password, secret }
}

function signSession(expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`suvarna-admin:${expiresAt}`).digest('base64url')
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!isAuthEnabled()) return true
  if (!token) return false

  try {
    const { secret } = getAuthConfiguration()
    const [expiresAtText, signature, ...extra] = token.split('.')
    const expiresAt = Number(expiresAtText)
    if (extra.length || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      return false
    }

    const expected = Buffer.from(signSession(expiresAt, secret))
    const actual = Buffer.from(signature ?? '')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch (error) {
    if (error instanceof AuthConfigurationError) return false
    throw error
  }
}

export function isAuthenticated(request: NextRequest | Request): boolean {
  if (!isAuthEnabled()) return true
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
  return verifySessionToken(cookie?.slice(SESSION_COOKIE.length + 1))
}

export function validateAdminPassword(password: unknown): boolean {
  const { password: configuredPassword } = getAuthConfiguration()
  if (typeof password !== 'string' || password.length > 256) return false

  const suppliedHash = createHash('sha256').update(password).digest()
  const configuredHash = createHash('sha256').update(configuredPassword).digest()
  return timingSafeEqual(suppliedHash, configuredHash)
}

export function createSessionCookie(): string {
  const { secret } = getAuthConfiguration()
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  const signature = signSession(expiresAt, secret)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${expiresAt}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure}`
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
}
