export interface BillItem {
  name: string
  purity: string
  weight: number
}

export interface BillData {
  items: BillItem[]
  extraWeight: number
  purityDeduction: number
  billableWeight: number
  ratePerGram: number
  makingCharge: number
  advance: number
}

export interface BillRecord {
  id: string
  orderId: string | null
  customerName: string
  billDate: string
  billData: BillData
  totalAmount: number
  createdAt: string
}

export interface BillInput {
  orderId: string | null
  customerName: string
  billDate: string
  billData: BillData
  totalAmount: number
}
