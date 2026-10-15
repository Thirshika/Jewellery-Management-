import assert from 'node:assert/strict'
import test from 'node:test'
import { validateOrderInput } from '../lib/order-validation.ts'

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
