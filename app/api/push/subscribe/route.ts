import { errorResponse, requireAdmin } from '@/lib/server/http'
import { getDatabase } from '@/lib/server/database'

export const runtime = 'nodejs'

function isValidSubscription(value: unknown): value is {
  endpoint: string
  keys: { p256dh: string; auth: string }
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const subscription = value as Record<string, unknown>
  if (typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048) return false
  try {
    const endpoint = new URL(subscription.endpoint)
    if (endpoint.protocol !== 'https:') return false
  } catch {
    return false
  }
  const keys = subscription.keys
  return (
    typeof keys === 'object' &&
    keys !== null &&
    typeof (keys as Record<string, unknown>).p256dh === 'string' &&
    typeof (keys as Record<string, unknown>).auth === 'string'
  )
}

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  let subscription: unknown
  try {
    subscription = await request.json()
  } catch {
    return errorResponse('The browser subscription is invalid.', 400)
  }
  if (!isValidSubscription(subscription)) {
    return errorResponse('The browser subscription is invalid.', 400)
  }

  try {
    await getDatabase().query(
      `INSERT INTO push_subscriptions (endpoint, subscription)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (endpoint) DO UPDATE SET
         subscription = EXCLUDED.subscription,
         last_seen_at = NOW()`,
      [subscription.endpoint, JSON.stringify(subscription)],
    )
    return Response.json({ subscribed: true }, { status: 201 })
  } catch (error) {
    console.error('Could not save push subscription:', error)
    return errorResponse('Browser notifications could not be enabled.')
  }
}

export async function DELETE(request: Request) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('The browser subscription is invalid.', 400)
  }
  const endpoint =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).endpoint
      : undefined
  if (typeof endpoint !== 'string' || endpoint.length > 2048) {
    return errorResponse('The browser subscription is invalid.', 400)
  }

  try {
    await getDatabase().query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint])
    return Response.json({ subscribed: false })
  } catch (error) {
    console.error('Could not remove push subscription:', error)
    return errorResponse('Browser notifications could not be disabled.')
  }
}
