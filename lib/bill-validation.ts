import type { BillInput, BillItem } from '@/lib/bill-types'

export interface BillValidationResult {
  value?: BillInput
  error?: string
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 999999999999
}

function isBillItem(value: unknown): value is BillItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    item.name.trim().length <= 160 &&
    typeof item.purity === 'string' &&
    item.purity.trim().length <= 40 &&
    finiteNonNegative(item.weight)
  )
}

export function validateBillInput(input: unknown): BillValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'Enter valid bill details.' }
  }

  const fields = input as Record<string, unknown>
  const bill = fields.billData
  if (typeof fields.customerName !== 'string' || !fields.customerName.trim() || fields.customerName.trim().length > 160) {
    return { error: 'Enter a customer name for the bill.' }
  }
  if (!isDate(fields.billDate)) return { error: 'Choose a valid bill date.' }
  if (fields.orderId !== null && fields.orderId !== undefined && typeof fields.orderId !== 'string') {
    return { error: 'Choose a valid order.' }
  }
  if (
    typeof bill !== 'object' ||
    bill === null ||
    Array.isArray(bill) ||
    !Array.isArray((bill as Record<string, unknown>).items) ||
    ((bill as Record<string, unknown>).items as unknown[]).length < 1 ||
    ((bill as Record<string, unknown>).items as unknown[]).length > 50 ||
    !((bill as Record<string, unknown>).items as unknown[]).every(isBillItem)
  ) {
    return { error: 'Add at least one valid jewellery item to the bill.' }
  }

  const data = bill as Record<string, unknown>
  const numericFields = ['extraWeight', 'purityDeduction', 'billableWeight', 'ratePerGram', 'makingCharge', 'advance']
  if (!numericFields.every((key) => finiteNonNegative(data[key])) || !finiteNonNegative(fields.totalAmount)) {
    return { error: 'Enter valid non-negative weights and amounts.' }
  }
  if (fields.orderId !== null && fields.orderId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fields.orderId as string)) {
    return { error: 'Choose a valid order.' }
  }

  const items = data.items as BillItem[]
  const expectedTotal = Number((data.billableWeight as number) * (data.ratePerGram as number) + (data.makingCharge as number))
  if (Math.abs(expectedTotal - (fields.totalAmount as number)) > 0.01) {
    return { error: 'The bill total does not match its weights and charges.' }
  }

  return {
    value: {
      orderId: (fields.orderId as string | null | undefined) ?? null,
      customerName: (fields.customerName as string).trim(),
      billDate: fields.billDate,
      billData: {
        items: items.map((item) => ({ name: item.name.trim(), purity: item.purity.trim(), weight: item.weight })),
        extraWeight: data.extraWeight as number,
        purityDeduction: data.purityDeduction as number,
        billableWeight: data.billableWeight as number,
        ratePerGram: data.ratePerGram as number,
        makingCharge: data.makingCharge as number,
        advance: data.advance as number,
      },
      totalAmount: fields.totalAmount as number,
    },
  }
}
