import { errorResponse, isUuid, requireWorkspace } from '@/lib/server/http'
import { getDueReminders, markPopupShown } from '@/lib/server/orders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId

  try {
    const reminders = await getDueReminders(workspaceId)
    return Response.json({ reminders }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Could not load due reminders:', error)
    return errorResponse('Due reminders could not be loaded.')
  }
}

export async function POST(request: Request) {
  const workspaceId = requireWorkspace(request)
  if (typeof workspaceId !== 'string') return workspaceId

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Reminder details are invalid.', 400)
  }
  const reminderId =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).reminderId
      : undefined
  if (typeof reminderId !== 'string' || !isUuid(reminderId)) {
    return errorResponse('Reminder details are invalid.', 400)
  }

  try {
    await markPopupShown(reminderId, workspaceId)
    return Response.json({ recorded: true })
  } catch (error) {
    console.error('Could not record reminder popup:', error)
    return errorResponse('The reminder popup could not be recorded.')
  }
}
