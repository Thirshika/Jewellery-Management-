import { errorResponse } from '@/lib/server/http'
import { dispatchDueReminders } from '@/lib/server/reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 32) {
    console.error('CRON_SECRET is missing or too short.')
    return errorResponse('Reminder scheduler is not configured.', 503)
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return errorResponse('Unauthorized.', 401)
  }

  try {
    return Response.json(await dispatchDueReminders(), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Scheduled reminder dispatch failed:', error)
    return errorResponse('Reminder delivery could not be completed.')
  }
}
