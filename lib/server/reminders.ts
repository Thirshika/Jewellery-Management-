import 'server-only'
import webpush, { type PushSubscription } from 'web-push'
import { getDatabase } from '@/lib/server/database'
import type { OrderRecord } from '@/lib/order-types'

interface ClaimedReminder {
  id: string
  order_id: string
  customer_name: string
  jewellery_name: string
  advance_amount: string
  delivery_deadline: string
}

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`))
}

function formatAmount(value: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value))
}

export async function dispatchReminderIfDue(order: OrderRecord): Promise<string | undefined> {
  if (!order.reminderAt || Date.parse(order.reminderAt) > Date.now()) return undefined

  try {
    const result = await dispatchDueReminders()
    return result.retrying
      ? 'The order was saved, but its push reminder could not be delivered yet. It will be retried by the scheduler.'
      : undefined
  } catch (error) {
    console.error(`Immediate reminder dispatch failed for order ${order.id}:`, error)
    return 'The order was saved, but its reminder could not be dispatched immediately. The scheduler will retry it.'
  }
}

export async function dispatchDueReminders() {
  const database = getDatabase()
  const claimed = await database.query<ClaimedReminder>(
    `WITH due AS (
       SELECT r.id
       FROM order_reminders r
       JOIN orders o ON o.id = r.order_id
       WHERE r.reminder_at <= NOW()
         AND o.status = 'pending'
         AND (
           r.status = 'scheduled'
           OR (r.status = 'dispatching' AND r.dispatch_lease_until <= NOW())
         )
       ORDER BY r.reminder_at ASC
       LIMIT 50
       FOR UPDATE OF r SKIP LOCKED
     ),
     claimed AS (
       UPDATE order_reminders r
       SET status = 'dispatching',
           delivery_attempts = r.delivery_attempts + 1,
           dispatch_lease_until = NOW() + INTERVAL '5 minutes',
           updated_at = NOW()
       FROM due
       WHERE r.id = due.id
       RETURNING r.id, r.order_id
     )
     SELECT claimed.id, claimed.order_id, o.customer_name, o.jewellery_name,
       o.advance_amount, o.delivery_deadline
     FROM claimed
     JOIN orders o ON o.id = claimed.order_id`,
  )

  if (!claimed.rowCount) return { processed: 0, delivered: 0, retrying: 0 }

  const subscriptions = await database.query<{ id: number; endpoint: string; subscription: PushSubscription }>(
    'SELECT id, endpoint, subscription FROM push_subscriptions',
  )
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  const pushConfigured = Boolean(publicKey && privateKey && subject)
  if (subscriptions.rowCount && !pushConfigured) {
    for (const reminder of claimed.rows) {
      await database.query(
        `UPDATE order_reminders SET status = 'scheduled', dispatch_lease_until = NULL,
           updated_at = NOW()
         WHERE id = $1 AND status = 'dispatching'`,
        [reminder.id],
      )
      await database.query(
        `INSERT INTO notification_history (order_id, reminder_id, event_type, details)
         VALUES ($1, $2, 'push_failed', '{"reason":"VAPID configuration missing"}'::jsonb)`,
        [reminder.order_id, reminder.id],
      )
    }
    throw new Error('Push subscriptions exist but VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_SUBJECT is missing.')
  }
  if (pushConfigured) webpush.setVapidDetails(subject!, publicKey!, privateKey!)

  let delivered = 0
  let retrying = 0
  for (const reminder of claimed.rows) {
    let sent = 0
    const failures: Array<{ subscriptionId: number; statusCode?: number }> = []
    const payload = JSON.stringify({
      title: `Delivery reminder for ${reminder.customer_name}`,
      body: `${reminder.jewellery_name} · Advance ${formatAmount(reminder.advance_amount)} · Due ${formatDeadline(reminder.delivery_deadline)}`,
      tag: `order-reminder-${reminder.order_id}`,
      data: { orderId: reminder.order_id, url: `/?order=${reminder.order_id}` },
      actions: [
        { action: 'view', title: 'View order' },
        { action: 'complete', title: 'Mark completed' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })

    for (const subscription of subscriptions.rows) {
      try {
        await webpush.sendNotification(subscription.subscription, payload, {
          TTL: 60 * 60 * 24,
          urgency: 'high',
        })
        sent += 1
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number(error.statusCode)
            : undefined
        failures.push({ subscriptionId: subscription.id, statusCode })
        console.error('Push delivery failed.', { reminderId: reminder.id, statusCode })
        if (statusCode === 404 || statusCode === 410) {
          await database.query('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id])
        }
      }
    }

    const shouldRetry = subscriptions.rows.length > 0 && sent === 0
    const newStatus = shouldRetry ? 'scheduled' : 'delivered'
    const finalized = await database.query(
      `UPDATE order_reminders SET status = $2,
         dispatch_lease_until = NULL,
         delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
         updated_at = NOW()
       WHERE id = $1 AND status = 'dispatching'`,
      [reminder.id, newStatus],
    )
    if (!finalized.rowCount) continue

    if (sent > 0) {
      await database.query(
        `INSERT INTO notification_history (order_id, reminder_id, event_type, details)
         VALUES ($1, $2, 'push_sent', $3::jsonb)`,
        [reminder.order_id, reminder.id, JSON.stringify({ sent })],
      )
    }
    if (failures.length) {
      await database.query(
        `INSERT INTO notification_history (order_id, reminder_id, event_type, details)
         VALUES ($1, $2, 'push_failed', $3::jsonb)`,
        [reminder.order_id, reminder.id, JSON.stringify({ failures })],
      )
    }
    if (!subscriptions.rows.length) {
      await database.query(
        `INSERT INTO notification_history (order_id, reminder_id, event_type, details)
         VALUES ($1, $2, 'dispatch_completed', '{"pushSubscriptions":0}'::jsonb)`,
        [reminder.order_id, reminder.id],
      )
    }
    if (shouldRetry) retrying += 1
    else delivered += 1
  }

  return { processed: claimed.rowCount, delivered, retrying }
}
