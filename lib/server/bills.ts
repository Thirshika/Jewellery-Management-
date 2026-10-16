import 'server-only'
import { getDatabase } from '@/lib/server/database'
import type { BillInput, BillRecord } from '@/lib/bill-types'

export class BillOrderNotFoundError extends Error {}

async function requireWorkspaceOrder(orderId: string | null, workspaceId: string) {
  if (!orderId) return
  const result = await getDatabase().query(
    'SELECT id FROM orders WHERE id = $1 AND workspace_id = $2',
    [orderId, workspaceId],
  )
  if (!result.rowCount) throw new BillOrderNotFoundError('Linked order was not found in this workspace.')
}

function mapBill(row: Record<string, unknown>): BillRecord {
  return {
    id: String(row.id),
    orderId: row.orderId ? String(row.orderId) : null,
    customerName: String(row.customerName),
    billDate: String(row.billDate).slice(0, 10),
    billData: row.billData as BillRecord['billData'],
    totalAmount: Number(row.totalAmount),
    createdAt: new Date(row.createdAt as string).toISOString(),
  }
}

export async function getBills(workspaceId: string): Promise<BillRecord[]> {
  const result = await getDatabase().query(
    `SELECT id, order_id AS "orderId", customer_name AS "customerName",
      bill_date::text AS "billDate", bill_data AS "billData",
      total_amount AS "totalAmount", created_at AS "createdAt"
     FROM saved_bills WHERE workspace_id = $1
     ORDER BY bill_date DESC, created_at DESC`,
    [workspaceId],
  )
  return result.rows.map(mapBill)
}

export async function createBill(workspaceId: string, input: BillInput): Promise<BillRecord> {
  await requireWorkspaceOrder(input.orderId, workspaceId)
  const result = await getDatabase().query(
    `INSERT INTO saved_bills (workspace_id, order_id, customer_name, bill_date, bill_data, total_amount)
     VALUES ($1, $2, $3, $4::date, $5::jsonb, $6)
     RETURNING id, order_id AS "orderId", customer_name AS "customerName",
       bill_date::text AS "billDate", bill_data AS "billData",
       total_amount AS "totalAmount", created_at AS "createdAt"`,
    [workspaceId, input.orderId, input.customerName, input.billDate, JSON.stringify(input.billData), input.totalAmount.toFixed(2)],
  )
  return mapBill(result.rows[0])
}

export async function updateBill(id: string, workspaceId: string, input: BillInput): Promise<BillRecord | null> {
  await requireWorkspaceOrder(input.orderId, workspaceId)
  const result = await getDatabase().query(
    `UPDATE saved_bills SET order_id = $3, customer_name = $4, bill_date = $5::date,
       bill_data = $6::jsonb, total_amount = $7, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2
     RETURNING id, order_id AS "orderId", customer_name AS "customerName",
       bill_date::text AS "billDate", bill_data AS "billData",
       total_amount AS "totalAmount", created_at AS "createdAt"`,
    [id, workspaceId, input.orderId, input.customerName, input.billDate, JSON.stringify(input.billData), input.totalAmount.toFixed(2)],
  )
  return result.rows[0] ? mapBill(result.rows[0]) : null
}
