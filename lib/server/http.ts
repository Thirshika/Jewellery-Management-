import 'server-only'
import { isAuthEnabled, isAuthenticated } from '@/lib/server/auth'

export function unauthorizedResponse() {
  return Response.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 })
}

export function requireAdmin(request: Request): Response | null {
  if (!isAuthEnabled()) return null
  return isAuthenticated(request) ? null : unauthorizedResponse()
}

export function errorResponse(message: string, status = 500) {
  return Response.json({ error: message }, { status })
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
