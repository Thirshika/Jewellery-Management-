export interface OrderInput {
  customerName: string
  jewelleryName: string
  advanceAmount: number
  orderDate: string
  deliveryDeadline: string
  additionalNotes: string
  sampleImage?: string | null
}

export interface ValidationResult {
  value?: OrderInput
  error?: string
}

const MAX_SAMPLE_IMAGE_BYTES = 1_000_000

function isSampleImage(value: unknown): value is string | null {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value)
  if (!match || match[1].length % 4 !== 0) return false
  const padding = match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0
  const bytes = (match[1].length / 4) * 3 - padding
  return bytes > 0 && bytes <= MAX_SAMPLE_IMAGE_BYTES
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function validateOrderInput(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'Enter valid order details.' }
  }

  const fields = input as Record<string, unknown>
  const customerName = typeof fields.customerName === 'string' ? fields.customerName.trim() : ''
  const jewelleryName = typeof fields.jewelleryName === 'string' ? fields.jewelleryName.trim() : ''
  const additionalNotes = typeof fields.additionalNotes === 'string' ? fields.additionalNotes.trim() : ''
  const sampleImage = fields.sampleImage
  const amountProvided =
    (typeof fields.advanceAmount === 'string' && fields.advanceAmount.trim() !== '') ||
    typeof fields.advanceAmount === 'number'
  const advanceAmount = Number(fields.advanceAmount)

  if (
    !customerName ||
    !jewelleryName ||
    !amountProvided ||
    !isIsoDate(fields.orderDate) ||
    !isIsoDate(fields.deliveryDeadline)
  ) {
    return { error: 'Customer, jewellery, advance amount, order date, and delivery deadline are required.' }
  }
  if (customerName.length > 160 || jewelleryName.length > 160) {
    return { error: 'Customer and jewellery names must be 160 characters or fewer.' }
  }
  if (!Number.isFinite(advanceAmount) || advanceAmount < 0 || advanceAmount > 9999999999.99) {
    return { error: 'Enter a valid advance amount.' }
  }
  if (Number(advanceAmount.toFixed(2)) !== advanceAmount) {
    return { error: 'Advance amount can have at most two decimal places.' }
  }
  if (fields.deliveryDeadline < fields.orderDate) {
    return { error: 'Delivery deadline cannot be before the order date.' }
  }
  if (additionalNotes.length > 5000) {
    return { error: 'Additional notes must be 5,000 characters or fewer.' }
  }
  if (!isSampleImage(sampleImage)) {
    return { error: 'Sample image must be a JPEG, PNG, or WebP image no larger than 1 MB.' }
  }

  return {
    value: {
      customerName,
      jewelleryName,
      advanceAmount,
      orderDate: fields.orderDate,
      deliveryDeadline: fields.deliveryDeadline,
      additionalNotes,
      ...(sampleImage !== undefined ? { sampleImage: sampleImage || null } : {}),
    },
  }
}
