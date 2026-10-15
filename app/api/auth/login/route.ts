import {
  AuthConfigurationError,
  createSessionCookie,
  validateAdminPassword,
} from '@/lib/server/auth'
import { errorResponse } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Enter a valid password.', 400)
  }

  try {
    const password =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).password
        : undefined
    if (!validateAdminPassword(password)) {
      return errorResponse('The password is incorrect.', 401)
    }

    return new Response(JSON.stringify({ authenticated: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': createSessionCookie(),
      },
    })
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return errorResponse(error.message, 503)
    }
    console.error('Admin login failed:', error)
    return errorResponse('Sign-in is temporarily unavailable.', 500)
  }
}
