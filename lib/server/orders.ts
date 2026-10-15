import 'server-only'
import type { PoolClient } from 'pg'
import { getDatabase } from '@/lib/server/database'
import type { OrderInput } from '@/lib/order-validation'
import type { OrderRecord } from '@/lib/order-types'
export type OrderFilter = 'all' | 'pending' | 'completed' | 'overdue'

const ORDER_SELECT = `
  SELECT
    o.id,
    o.customer_name AS "customerName",
    o.jewellery_name AS "jewelleryName",
    o.advance_amount AS "advanceAmount",
    o.order_date::text AS "orderDate",
    o.delivery_deadline::text AS "deliveryDeadline",
    o.additional_notes AS "additionalNotes",
    CASE
      WHEN o.status = 'completed' THEN 'completed'
      WHEN o.delivery_deadline < (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN 'overdue'
      ELSE 'pending'
    END AS status,
    o.created_at AS "createdAt",
    o.updated_at AS "updatedAt",
    r.reminder_at AS "reminderAt",
    r.status AS "reminderStatus"
  FROM orders o
  LEFT JOIN order_reminders r ON r.order_id = o.id
`

function mapOrder(row: Record<string, unknown>): OrderRecord {
  return {
    ...(row as unknown as OrderRecord),
    advanceAmount: Number(row.advanceAmount),
    orderDate: String(row.orderDate).slice(0, 10),
    deliveryDeadline: String(row.deliveryDeadline).slice(0, 10),
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
    reminderAt: row.reminderAt ? new Date(row.reminderAt as string).toISOString() : null,
  }
}

export async function getOrders(filter: OrderFilter = 'all', search = ''): Promise<OrderRecord[]> {
  const pool = getDatabase()
  const clauses: string[] = []
  const values: unknown[] = []
  if (filter !== 'all') {
    if (filter === 'overdue') {
      clauses.push(
        "o.status = 'pending' AND o.delivery_deadline < (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
      )
    } else if (filter === 'pending') {
      clauses.push(
        "o.status = 'pending' AND o.delivery_deadline >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
      )
    } else {
      clauses.push("o.status = 'completed'")
    }
  }
  if (search) {
    values.push(`%${search}%`)
    clauses.push(`(o.customer_name ILIKE $${values.length} OR o.jewellery_name ILIKE $${values.length})`)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const result = await pool.query(
    `${ORDER_SELECT} ${where} ORDER BY
      CASE WHEN o.status = 'pending' AND o.delivery_deadline < (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN 0 ELSE 1 END,
      o.delivery_deadline ASC,
      o.created_at DESC`,
    values,
  )
  return result.rows.map(mapOrder)
}

export async function getOrder(id: string, client?: PoolClient): Promise<OrderRecord | null> {
  const executor = client ?? getDatabase()
  const result = await executor.query(`${ORDER_SELECT} WHERE o.id = $1`, [id])
  return result.rows[0] ? mapOrder(result.rows[0]) : null
}

async function writeHistory(
  client: PoolClient,
  orderId: string,
  reminderId: string,
  eventType: string,
  details: Record<string, unknown> = {},
) {
  await client.query(
    `INSERT INTO notification_history (order_id, reminder_id, event_type, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [orderId, reminderId, eventType, JSON.stringify(details)],
  )
}

async function scheduleReminder(client: PoolClient, orderId: string, eventType: string) {
  const result = await client.query(
    `INSERT INTO order_reminders (order_id, reminder_at)
     VALUES ($1, (((SELECT delivery_deadline FROM orders WHERE id = $1) - 1) + TIME '09:00')
       AT TIME ZONE 'Asia/Kolkata')
     ON CONFLICT (order_id) DO UPDATE SET
       reminder_at = EXCLUDED.reminder_at,
       status = 'scheduled',
       version = order_reminders.version + 1,
       delivery_attempts = 0,
       dispatch_lease_until = NULL,
       delivered_at = NULL,
       dismissed_at = NULL,
       updated_at = NOW()
     RETURNING id, reminder_at`,
    [orderId],
  )
  await writeHistory(client, orderId, result.rows[0].id, eventType, {
    reminderAt: new Date(result.rows[0].reminder_at).toISOString(),
    timeZone: 'Asia/Kolkata',
  })
}

export async function createOrder(input: OrderInput): Promise<OrderRecord> {
  const pool = getDatabase()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO orders
        (customer_name, jewellery_name, advance_amount, order_date, delivery_deadline, additional_notes)
       VALUES ($1, $2, $3, $4::date, $5::date, $6)
       RETURNING id`,
      [
        input.customerName,
        input.jewelleryName,
        input.advanceAmount.toFixed(2),
        input.orderDate,
        input.deliveryDeadline,
        input.additionalNotes,
      ],
    )
    const id = inserted.rows[0].id as string
    await scheduleReminder(client, id, 'scheduled')
    const order = await getOrder(id, client)
    if (!order) throw new Error('Order was created but could not be read back.')
    await client.query('COMMIT')
    return order
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function updateOrder(id: string, input: OrderInput): Promise<OrderRecord | null> {
  const pool = getDatabase()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const previous = await client.query(
      `SELECT status, delivery_deadline::text AS delivery_deadline
       FROM orders WHERE id = $1 FOR UPDATE`,
      [id],
    )
    if (!previous.rows[0]) {
      await client.query('ROLLBACK')
      return null
    }
    await client.query(
      `UPDATE orders SET
        customer_name = $2,
        jewellery_name = $3,
        advance_amount = $4,
        order_date = $5::date,
        delivery_deadline = $6::date,
        additional_notes = $7,
        updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        input.customerName,
        input.jewelleryName,
        input.advanceAmount.toFixed(2),
        input.orderDate,
        input.deliveryDeadline,
        input.additionalNotes,
      ],
    )

    if (previous.rows[0].status === 'pending') {
      if (String(previous.rows[0].delivery_deadline).slice(0, 10) !== input.deliveryDeadline) {
        await scheduleReminder(client, id, 'rescheduled')
      }
    }

    const order = await getOrder(id, client)
    await client.query('COMMIT')
    return order
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function rescheduleOrder(id: string, deliveryDeadline: string): Promise<OrderRecord | null> {
  const pool = getDatabase()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const current = await client.query(
      `SELECT status, order_date::text AS order_date, delivery_deadline::text AS delivery_deadline
       FROM orders WHERE id = $1 FOR UPDATE`,
      [id],
    )
    if (!current.rowCount) {
      await client.query('ROLLBACK')
      return null
    }
    if (current.rows[0].status !== 'pending') {
      throw new Error('Delivery deadline cannot be changed after the order is completed.')
    }
    if (deliveryDeadline < String(current.rows[0].order_date).slice(0, 10)) {
      throw new Error('Delivery deadline cannot be before the order date.')
    }
    if (String(current.rows[0].delivery_deadline).slice(0, 10) !== deliveryDeadline) {
      await client.query(
        `UPDATE orders SET delivery_deadline = $2::date, updated_at = NOW()
         WHERE id = $1`,
        [id, deliveryDeadline],
      )
      await scheduleReminder(client, id, 'rescheduled')
    }
    const order = await getOrder(id, client)
    await client.query('COMMIT')
    return order
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function completeOrder(id: string): Promise<OrderRecord | null> {
  const pool = getDatabase()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const updated = await client.query(
      `UPDATE orders SET status = 'completed', updated_at = NOW()
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [id],
    )
    if (!updated.rowCount) {
      const exists = await client.query('SELECT id FROM orders WHERE id = $1', [id])
      await client.query('ROLLBACK')
      if (!exists.rowCount) return null
      throw new Error('This order is already completed.')
    }
    const reminder = await client.query(
      `UPDATE order_reminders SET status = 'completed', dispatch_lease_until = NULL,
         updated_at = NOW()
       WHERE order_id = $1 RETURNING id`,
      [id],
    )
    if (reminder.rows[0]) await writeHistory(client, id, reminder.rows[0].id, 'completed')
    const order = await getOrder(id, client)
    await client.query('COMMIT')
    return order
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function dismissReminder(id: string): Promise<boolean> {
  const pool = getDatabase()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE order_reminders SET status = 'dismissed', dismissed_at = NOW(),
         dispatch_lease_until = NULL, updated_at = NOW()
       WHERE order_id = $1 AND status IN ('scheduled', 'dispatching', 'delivered')
       RETURNING id`,
      [id],
    )
    if (result.rows[0]) await writeHistory(client, id, result.rows[0].id, 'dismissed')
    await client.query('COMMIT')
    return Boolean(result.rowCount)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getDueReminders() {
  const result = await getDatabase().query(
    `SELECT r.id AS "reminderId", o.id AS "orderId", o.customer_name AS "customerName",
       o.jewellery_name AS "jewelleryName", o.advance_amount AS "advanceAmount",
       o.order_date::text AS "orderDate", o.delivery_deadline::text AS "deliveryDeadline",
      o.additional_notes AS "additionalNotes", r.reminder_at AS "reminderAt",
      r.version AS "reminderVersion"
     FROM order_reminders r
     JOIN orders o ON o.id = r.order_id
     WHERE r.status IN ('scheduled', 'dispatching', 'delivered')
       AND r.reminder_at <= NOW() AND o.status = 'pending'
     ORDER BY r.reminder_at ASC`,
  )
  return result.rows.map((row) => ({
    ...row,
    advanceAmount: Number(row.advanceAmount),
    orderDate: String(row.orderDate).slice(0, 10),
    deliveryDeadline: String(row.deliveryDeadline).slice(0, 10),
    reminderAt: new Date(row.reminderAt).toISOString(),
  }))
}

export async function markPopupShown(reminderId: string) {
  await getDatabase().query(
    `INSERT INTO notification_history (order_id, reminder_id, event_type)
     SELECT order_id, id, 'popup_shown' FROM order_reminders
     WHERE id = $1 AND status IN ('scheduled', 'dispatching', 'delivered')`,
    [reminderId],
  )
}
