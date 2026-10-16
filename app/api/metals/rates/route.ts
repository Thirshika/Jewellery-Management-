import { parseGoldApiPrice } from '@/lib/metals-rates'
import { requireWorkspace } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_BASE_URL = 'https://api.gold-api.com/price'
const CACHE_SECONDS = 15 * 60

async function fetchSpotRate(symbol: 'XAU' | 'XAG') {
  const response = await fetch(`${API_BASE_URL}/${symbol}/INR`, {
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Metals rate provider returned HTTP ${response.status}.`)

  const rate = parseGoldApiPrice(await response.json(), symbol)
  if (!rate) throw new Error(`Metals rate provider returned invalid ${symbol} data.`)
  return rate
}

export async function GET(request: Request) {
  const workspace = requireWorkspace(request)
  if (typeof workspace !== 'string') return workspace

  try {
    const [gold, silver] = await Promise.all([
      fetchSpotRate('XAU'),
      fetchSpotRate('XAG'),
    ])
    return Response.json(
      {
        location: 'Tamil Nadu',
        rates: {
          gold24k: gold,
          gold22k: { pricePerGram: gold.pricePerGram * (22 / 24), updatedAt: gold.updatedAt },
          silver999: { pricePerGram: silver.pricePerGram * 0.999, updatedAt: silver.updatedAt },
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    console.error('Could not load indicative gold and silver rates:', error)
    return Response.json(
      { error: 'Live indicative metal rates are temporarily unavailable. Please retry shortly.' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
