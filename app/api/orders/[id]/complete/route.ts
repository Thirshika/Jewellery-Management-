import { errorResponse, isUuid, requireAdmin } from '@/lib/server/http'
import { completeOrder } from '@/lib/server/orders'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized
  const { id } = await context.params
  if (!isUuid(id)) return errorResponse('Order was not found.', 404)

  try {
    const order = await completeOrder(id)
    return order ? Response.json({ order }) : errorResponse('Order was not found.', 404)
  } catch (error) {
    if (error instanceof Error && error.message === 'This order is already completed.') {
      return errorResponse(error.message, 409)
    }
    console.error('Could not complete order:', error)
    return errorResponse('The order could not be marked as completed.')
  }
}
