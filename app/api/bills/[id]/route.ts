import { validateBillInput } from '@/lib/bill-validation'
import { BillOrderNotFoundError, updateBill } from '@/lib/server/bills'
import { errorResponse, isUuid, requireWorkspace } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId
  const { id } = await context.params
  if (!isUuid(id)) return errorResponse('Saved bill was not found.', 404)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Enter valid bill details.', 400)
  }
  const validation = validateBillInput(body)
  if (!validation.value) return errorResponse(validation.error ?? 'Enter valid bill details.', 400)
  try {
    const bill = await updateBill(id, workspaceId, validation.value)
    return bill
      ? Response.json({ bill }, { headers: { 'Cache-Control': 'no-store' } })
      : errorResponse('Saved bill was not found.', 404)
  } catch (error) {
    if (error instanceof BillOrderNotFoundError) return errorResponse('Linked order was not found.', 404)
    console.error('Could not update saved bill:', error)
    return errorResponse('The bill could not be updated.')
  }
}
