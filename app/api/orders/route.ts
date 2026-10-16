import { validateOrderInput } from '@/lib/order-validation'
import { errorResponse, requireWorkspace } from '@/lib/server/http'
import { createOrder, getOrders, type OrderFilter } from '@/lib/server/orders'
import { dispatchReminderIfDue } from '@/lib/server/reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const filters = new Set<OrderFilter>(['all', 'pending', 'completed', 'overdue'])

export async function GET(request: Request) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId

  const url = new URL(request.url)
  const requestedFilter = url.searchParams.get('status') ?? 'all'
  if (!filters.has(requestedFilter as OrderFilter)) {
    return errorResponse('Choose a valid order status filter.', 400)
  }
  const search = (url.searchParams.get('search') ?? '').trim().slice(0, 120)

  try {
    const orders = await getOrders(workspaceId, requestedFilter as OrderFilter, search)
    return Response.json({ orders }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Could not load orders:', error)
    return errorResponse('Orders could not be loaded. Check the database connection and migration.')
  }
}

export async function POST(request: Request) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Enter valid order details.', 400)
  }
  const validation = validateOrderInput(body)
  if (!validation.value) return errorResponse(validation.error ?? 'Enter valid order details.', 400)

  try {
    const order = await createOrder(workspaceId, validation.value)
    const warning = await dispatchReminderIfDue(order, workspaceId)
    return Response.json({ order, warning }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Could not create order:', error)
    return errorResponse('The order could not be saved. Check the database connection and migration.')
  }
}
