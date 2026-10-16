export const TROY_OUNCE_GRAMS = 31.1034768

export type MetalSpotRate = {
  pricePerGram: number
  updatedAt: string
}

type GoldApiPrice = {
  currency?: unknown
  price?: unknown
  symbol?: unknown
  updatedAt?: unknown
}

export function parseGoldApiPrice(value: unknown, expectedSymbol: 'XAU' | 'XAG'): MetalSpotRate | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const response = value as GoldApiPrice
  if (
    response.symbol !== expectedSymbol ||
    response.currency !== 'INR' ||
    typeof response.price !== 'number' ||
    !Number.isFinite(response.price) ||
    response.price <= 0 ||
    typeof response.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(response.updatedAt))
  ) {
    return null
  }

  return {
    pricePerGram: response.price / TROY_OUNCE_GRAMS,
    updatedAt: new Date(response.updatedAt).toISOString(),
  }
}
