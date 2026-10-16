import assert from 'node:assert/strict'
import test from 'node:test'
import { validateOrderInput } from '../lib/order-validation.ts'
import { validateBillInput } from '../lib/bill-validation.ts'
import { isValidPassword, normalizeAccountIdentifier, normalizeAccountName } from '../lib/auth-validation.ts'
import { parseGoldApiPrice, TROY_OUNCE_GRAMS } from '../lib/metals-rates.ts'

test('normalizes account emails and validates signup password length', () => {
  assert.equal(normalizeAccountName('  Meera Shah  '), 'Meera Shah')
  assert.equal(normalizeAccountName('  '), null)
  assert.equal(normalizeAccountName('x'.repeat(81)), null)
  assert.equal(normalizeAccountName('Meera\nShah'), null)
  assert.deepEqual(normalizeAccountIdentifier('  Owner@Example.com '), { email: 'owner@example.com', phone: null })
  assert.deepEqual(normalizeAccountIdentifier('98765 43210'), { email: null, phone: '+919876543210' })
  assert.deepEqual(normalizeAccountIdentifier('+1 (415) 555-2671'), { email: null, phone: '+14155552671' })
  assert.equal(normalizeAccountIdentifier('not-an-email'), null)
  assert.equal(normalizeAccountIdentifier('123'), null)
  assert.equal(isValidPassword('long-enough-password', true), true)
  assert.equal(isValidPassword('short', true), false)
  assert.equal(isValidPassword('long-enough-password', false), true)
  assert.equal(isValidPassword('x'.repeat(257), false), false)
})

test('converts INR troy-ounce gold and silver prices to per-gram spot prices', () => {
  const updatedAt = '2026-10-16T11:44:37Z'
  const gold = parseGoldApiPrice({ symbol: 'XAU', currency: 'INR', price: 31000, updatedAt }, 'XAU')
  assert.equal(TROY_OUNCE_GRAMS, 31.1034768)
  assert.equal(gold?.pricePerGram, 31000 / TROY_OUNCE_GRAMS)
  assert.equal(gold?.updatedAt, '2026-10-16T11:44:37.000Z')
  assert.equal(parseGoldApiPrice({ symbol: 'XAG', currency: 'INR', price: 3100, updatedAt }, 'XAG')?.pricePerGram, 3100 / TROY_OUNCE_GRAMS)
})

test('rejects invalid or mismatched market-rate responses', () => {
  const updatedAt = '2026-10-16T11:44:37Z'
  assert.equal(parseGoldApiPrice({ symbol: 'XAG', currency: 'INR', price: 31000, updatedAt }, 'XAU'), null)
  assert.equal(parseGoldApiPrice({ symbol: 'XAU', currency: 'USD', price: 31000, updatedAt }, 'XAU'), null)
  assert.equal(parseGoldApiPrice({ symbol: 'XAU', currency: 'INR', price: Number.NaN, updatedAt }, 'XAU'), null)
  assert.equal(parseGoldApiPrice({ symbol: 'XAU', currency: 'INR', price: -10, updatedAt }, 'XAU'), null)
  assert.equal(parseGoldApiPrice({ symbol: 'XAU', currency: 'INR', price: 31000, updatedAt: 'not-a-date' }, 'XAU'), null)
})

const validOrder = {
  customerName: 'Meera Shah',
  jewelleryName: 'Bridal necklace',
  advanceAmount: 12500.5,
  orderDate: '2026-10-15',
  deliveryDeadline: '2026-11-02',
  additionalNotes: '22K gold',
}

test('accepts a valid order and keeps rupee amounts to two decimal places', () => {
  const result = validateOrderInput(validOrder)
  assert.equal(result.error, undefined)
  assert.equal(result.value?.advanceAmount, 12500.5)
  assert.equal(result.value?.customerName, 'Meera Shah')
})

test('accepts common decimal amounts that have binary floating-point representations', () => {
  assert.equal(validateOrderInput({ ...validOrder, advanceAmount: 1.15 }).error, undefined)
})

test('rejects missing required fields and malformed dates', () => {
  assert.match(validateOrderInput({ ...validOrder, customerName: ' ' }).error ?? '', /required/i)
  assert.match(validateOrderInput({ ...validOrder, advanceAmount: '' }).error ?? '', /advance amount.*required/i)
  assert.match(validateOrderInput({ ...validOrder, orderDate: '2026-02-30' }).error ?? '', /required/i)
})

test('rejects deadlines before the order date', () => {
  assert.match(
    validateOrderInput({ ...validOrder, deliveryDeadline: '2026-10-14' }).error ?? '',
    /before the order date/i,
  )
})

test('rejects negative, excessive-precision, and non-finite advances', () => {
  for (const advanceAmount of [-1, 1.155, Number.POSITIVE_INFINITY]) {
    assert.ok(validateOrderInput({ ...validOrder, advanceAmount }).error)
  }
})

test('trims names and enforces the notes limit', () => {
  assert.equal(validateOrderInput({ ...validOrder, customerName: '  Meera Shah  ' }).value?.customerName, 'Meera Shah')
  assert.match(validateOrderInput({ ...validOrder, additionalNotes: 'x'.repeat(5001) }).error ?? '', /5,000/)
})

test('accepts an optional supported sample jewellery image', () => {
  const result = validateOrderInput({ ...validOrder, sampleImage: 'data:image/jpeg;base64,aGVsbG8=' })
  assert.equal(result.error, undefined)
  assert.equal(result.value?.sampleImage, 'data:image/jpeg;base64,aGVsbG8=')
  assert.equal(validateOrderInput(validOrder).value?.sampleImage, undefined)
})

test('rejects unsupported or oversized sample jewellery images', () => {
  assert.match(
    validateOrderInput({ ...validOrder, sampleImage: 'data:image/svg+xml;base64,PHN2Zz4=' }).error ?? '',
    /JPEG, PNG, or WebP/i,
  )
  const oversizedImage = `data:image/jpeg;base64,${'A'.repeat(1_333_336)}`
  assert.match(validateOrderInput({ ...validOrder, sampleImage: oversizedImage }).error ?? '', /1 MB/i)
})

const validBill = {
  orderId: null,
  customerName: 'Meera Shah',
  billDate: '2026-10-16',
  billData: {
    items: [{ name: 'Necklace', purity: '916', weight: 8.05 }],
    extraWeight: 1.4,
    purityDeduction: 4,
    billableWeight: 5.45,
    ratePerGram: 13700,
    makingCharge: 1200,
    advance: 20000,
  },
  totalAmount: 75865,
}

test('accepts a complete bill snapshot with calculated total', () => {
  const result = validateBillInput(validBill)
  assert.equal(result.error, undefined)
  assert.equal(result.value?.billData.billableWeight, 5.45)
  assert.equal(result.value?.totalAmount, 75865)
})

test('rejects bills with missing item names or totals inconsistent with charges', () => {
  assert.match(
    validateBillInput({ ...validBill, billData: { ...validBill.billData, items: [{ name: '', purity: '916', weight: 1 }] } }).error ?? '',
    /at least one valid jewellery item/i,
  )
  assert.match(validateBillInput({ ...validBill, totalAmount: 1 }).error ?? '', /does not match/i)
})
