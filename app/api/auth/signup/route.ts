import {
  assertSessionConfiguration,
  AuthConfigurationError,
  createSessionCookie,
} from '@/lib/server/auth'
import { createAccount } from '@/lib/server/accounts'
import { isValidPassword, normalizeAccountIdentifier, normalizeAccountName } from '@/lib/auth-validation'
import { errorResponse } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Enter a valid email and password.', 400)
  }

  const credentials = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {}
  const displayName = normalizeAccountName(credentials.name)
  const identifier = normalizeAccountIdentifier(credentials.identifier ?? credentials.email)
  const password = credentials.password
  if (!displayName || !identifier || !isValidPassword(password, true)) {
    return errorResponse('Enter your name, a valid email or phone number, and a password with at least 12 characters.', 400)
  }

  try {
    assertSessionConfiguration()
    const account = await createAccount(displayName, identifier, password)
    return new Response(JSON.stringify({ authenticated: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': createSessionCookie(account.id, account.workspaceId),
      },
    })
  } catch (error) {
    if (error instanceof AuthConfigurationError) return errorResponse(error.message, 503)
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return errorResponse('An account with this email or phone number already exists.', 409)
    }
    console.error('Account sign-up failed:', error)
    return errorResponse('Sign-up is temporarily unavailable.', 500)
  }
}
