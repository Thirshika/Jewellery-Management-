import { clearSessionCookie } from '@/lib/server/auth'

export const runtime = 'nodejs'

export async function POST() {
  return new Response(JSON.stringify({ authenticated: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': clearSessionCookie(),
    },
  })
}
