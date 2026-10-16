export type OrderStatus = 'pending' | 'completed' | 'overdue'

export interface OrderRecord {
  id: string
  customerName: string
  jewelleryName: string
  advanceAmount: number
  orderDate: string
  deliveryDeadline: string
  additionalNotes: string
  sampleImage: string | null
  status: OrderStatus
  createdAt: string
  updatedAt: string
  reminderAt: string | null
  reminderStatus: string | null
}
