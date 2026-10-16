import { validateBillInput } from '@/lib/bill-validation'
import { BillOrderNotFoundError, createBill, getBills } from '@/lib/server/bills'
import { errorResponse, requireWorkspace } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId
  try {
    const bills = await getBills(workspaceId)
    return Response.json({ bills }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Could not load saved bills:', error)
    return errorResponse('Saved bills could not be loaded. Check the database connection and migration.')
  }
}

export async function POST(request: Request) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Enter valid bill details.', 400)
  }
  const validation = validateBillInput(body)
  if (!validation.value) return errorResponse(validation.error ?? 'Enter valid bill details.', 400)
  try {
    const bill = await createBill(workspaceId, validation.value)
    return Response.json({ bill }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof BillOrderNotFoundError) return errorResponse('Linked order was not found.', 404)
    console.error('Could not save bill:', error)
    return errorResponse('The bill could not be saved. Check the database connection and migration.')
  }
}
