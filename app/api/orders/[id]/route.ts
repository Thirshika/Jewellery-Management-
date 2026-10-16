import { validateOrderInput } from '@/lib/order-validation'
import { errorResponse, isUuid, requireWorkspace } from '@/lib/server/http'
import { deleteOrder, getOrder, updateOrder } from '@/lib/server/orders'
import { dispatchReminderIfDue } from '@/lib/server/reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId
  const { id } = await context.params
  if (!isUuid(id)) return errorResponse('Order was not found.', 404)

  try {
    const deleted = await deleteOrder(id, workspaceId)
    return deleted ? Response.json({ deleted: true }) : errorResponse('Order was not found.', 404)
  } catch (error) {
    console.error('Could not delete order:', error)
    return errorResponse('The order could not be deleted.')
  }
}

export async function GET(request: Request, context: RouteContext) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId
  const { id } = await context.params
  if (!isUuid(id)) return errorResponse('Order was not found.', 404)

  try {
    const order = await getOrder(id, workspaceId)
    return order
      ? Response.json({ order }, { headers: { 'Cache-Control': 'no-store' } })
      : errorResponse('Order was not found.', 404)
  } catch (error) {
    console.error('Could not load order:', error)
    return errorResponse('Order could not be loaded.')
  }
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
    return errorResponse('Enter valid order details.', 400)
  }
  const validation = validateOrderInput(body)
  if (!validation.value) return errorResponse(validation.error ?? 'Enter valid order details.', 400)

  try {
    const order = await updateOrder(id, workspaceId, validation.value)
    if (!order) return errorResponse('Order was not found.', 404)
    const warning = await dispatchReminderIfDue(order, workspaceId)
    return Response.json({ order, warning }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Could not update order:', error)
    return errorResponse('The order could not be updated.')
  }
}
