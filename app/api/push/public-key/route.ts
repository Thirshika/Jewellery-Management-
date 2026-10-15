import { requireAdmin, errorResponse } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const configured = Boolean(publicKey && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
  return Response.json({ enabled: configured, publicKey: configured ? publicKey : null })
}
