import 'server-only'
import { getAuthenticatedWorkspaceId } from '@/lib/server/auth'

export function unauthorizedResponse() {
  return Response.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 })
}

export function requireWorkspace(request: Request): string | Response {
  return getAuthenticatedWorkspaceId(request) ?? unauthorizedResponse()
}

export function errorResponse(message: string, status = 500) {
  return Response.json({ error: message }, { status })
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
