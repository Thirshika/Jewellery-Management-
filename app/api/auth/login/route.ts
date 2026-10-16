import {
  AuthConfigurationError,
  assertSessionConfiguration,
  createSessionCookie,
} from '@/lib/server/auth'
import { authenticateAccount } from '@/lib/server/accounts'
import { isValidPassword, normalizeAccountIdentifier } from '@/lib/auth-validation'
import { errorResponse } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Enter a valid email or phone number and password.', 400)
  }

  try {
    const credentials = typeof body === 'object' && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {}
    const identifier = normalizeAccountIdentifier(credentials.identifier ?? credentials.email)
    const password = credentials.password
    if (!identifier || !isValidPassword(password, false)) {
      return errorResponse('Email or phone number and password are incorrect.', 401)
    }

    assertSessionConfiguration()
    const account = await authenticateAccount(identifier, password)
    if (!account) return errorResponse('Email or phone number and password are incorrect.', 401)
    return new Response(JSON.stringify({ authenticated: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': createSessionCookie(account.id, account.workspaceId),
      },
    })
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return errorResponse(error.message, 503)
    }
    console.error('Account sign-in failed:', error)
    return errorResponse('Sign-in is temporarily unavailable.', 500)
  }
}
