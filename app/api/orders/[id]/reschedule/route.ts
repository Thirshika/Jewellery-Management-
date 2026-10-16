import { errorResponse, isUuid, requireWorkspace } from '@/lib/server/http'
import { rescheduleOrder } from '@/lib/server/orders'
import { dispatchReminderIfDue } from '@/lib/server/reminders'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export async function PATCH(request: Request, context: RouteContext) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId
  const { id } = await context.params
  if (!isUuid(id)) return errorResponse('Order was not found.', 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Choose a valid delivery deadline.', 400)
  }
  const deliveryDeadline =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).deliveryDeadline
      : undefined
  if (!isIsoDate(deliveryDeadline)) return errorResponse('Choose a valid delivery deadline.', 400)

  try {
    const order = await rescheduleOrder(id, workspaceId, deliveryDeadline)
    if (!order) return errorResponse('Order was not found.', 404)
    const warning = await dispatchReminderIfDue(order, workspaceId)
    return Response.json({ order, warning })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Delivery deadline cannot')) {
      return errorResponse(error.message, 409)
    }
    console.error('Could not reschedule order:', error)
    return errorResponse('The delivery deadline could not be changed.')
  }
}
