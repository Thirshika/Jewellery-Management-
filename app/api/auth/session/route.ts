import { isAuthEnabled, isAuthenticated } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return Response.json({ authenticated: !isAuthEnabled() || isAuthenticated(request) })
}
