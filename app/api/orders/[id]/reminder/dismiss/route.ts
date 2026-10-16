import { errorResponse, isUuid, requireWorkspace } from '@/lib/server/http'
import { dismissReminder } from '@/lib/server/orders'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId
  const { id } = await context.params
  if (!isUuid(id)) return errorResponse('Reminder was not found.', 404)

  try {
    await dismissReminder(id, workspaceId)
    return Response.json({ dismissed: true })
  } catch (error) {
    console.error('Could not dismiss reminder:', error)
    return errorResponse('The reminder could not be dismissed.')
  }
}
