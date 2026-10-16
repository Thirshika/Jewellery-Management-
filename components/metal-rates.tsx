'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/lib/language'

const REFRESH_INTERVAL_MS = 15 * 60 * 1000

type Rate = { pricePerGram: number; updatedAt: string }
type RatesResponse = {
  location: string
  rates: { gold24k: Rate; gold22k: Rate; silver999: Rate }
}

function formatRate(value: number, language: 'en' | 'ta') {
  return new Intl.NumberFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatUpdatedAt(value: string, language: 'en' | 'ta') {
  return new Intl.DateTimeFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function MetalRates() {
  const { language, t } = useLanguage()
  const [data, setData] = useState<RatesResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadRates = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)

    try {
      const response = await fetch('/api/metals/rates', { cache: 'no-store' })
      if (response.status === 401) {
        window.location.assign('/login')
        return
      }
      const result = (await response.json()) as RatesResponse & { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Live indicative metal rates are temporarily unavailable. Please retry shortly.')
      setData(result)
      setError('')
    } catch (cause) {
      console.error('Could not refresh indicative metal rates:', cause)
      setError(cause instanceof Error ? cause.message : 'Live indicative metal rates are temporarily unavailable. Please retry shortly.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadRates()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRates()
    }, REFRESH_INTERVAL_MS)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadRates()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadRates])

  return (
    <section className="content-wrap metal-rates-wrap" aria-labelledby="metal-rates-title">
      <div className="metal-rates-panel">
        <div className="metal-rates-heading">
          <div>
            <p className="eyebrow">{t('TAMIL NADU · INDICATIVE SPOT RATES')}</p>
            <h2 id="metal-rates-title">{t('Daily gold and silver rates')}</h2>
          </div>
          <button
            className="metal-rates-refresh"
            type="button"
            onClick={() => void loadRates(true)}
            disabled={loading || refreshing}
            aria-label={t('Refresh metal rates')}
            title={t('Refresh metal rates')}
          >
            {loading || refreshing ? <LoaderCircle size={17} className="spin" /> : <RefreshCw size={17} />}
          </button>
        </div>
        {loading && !data ? (
          <p className="metal-rates-message"><LoaderCircle size={16} className="spin" /> {t('Loading current market rates…')}</p>
        ) : error && !data ? (
          <div className="metal-rates-message metal-rates-error" role="alert">
            <span>{t(error)}</span>
            <button className="text-button" type="button" onClick={() => void loadRates(true)}>{t('Try again')}</button>
          </div>
        ) : data ? (
          <>
            <div className="metal-rates-grid">
              <RateCard label={t('Gold · 24K')} rate={data.rates.gold24k} language={language} />
              <RateCard label={t('Gold · 22K')} rate={data.rates.gold22k} language={language} />
              <RateCard label={t('Silver · 999')} rate={data.rates.silver999} language={language} />
            </div>
            {error && <p className="metal-rates-stale" role="status">{t(error)} {t('Showing the last available rates.')}</p>}
            <p className="metal-rates-disclaimer">
              {t('Indicative global spot rates converted to INR per gram. Not a Tamil Nadu jeweller quote; local taxes, GST, and making charges may differ.')}
              {' '}
              <span>{t('Updates every 15 minutes while the website is open.')}</span>
            </p>
            <p className="metal-rates-google">
              <a
                href="https://www.google.com/search?q=Tamil+Nadu+gold+rate+today+22K+24K+silver+rate"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('Search Tamil Nadu gold and silver rates on Google')}
              </a>
              <span>{t('Google search results may include rates from different sources and locations.')}</span>
            </p>
            <p className="metal-rates-source">
              {t('Rate updated')} {formatUpdatedAt(
                data.rates.gold24k.updatedAt < data.rates.silver999.updatedAt
                  ? data.rates.gold24k.updatedAt
                  : data.rates.silver999.updatedAt,
                language,
              )}
            </p>
          </>
        ) : null}
      </div>
    </section>
  )
}

function RateCard({
  label,
  rate,
  language,
}: {
  label: string
  rate: Rate
  language: 'en' | 'ta'
}) {
  return (
    <div className="metal-rate-card">
      <span>{label}</span>
      <strong>{formatRate(rate.pricePerGram, language)}</strong>
      <small>{language === 'ta' ? 'ஒரு கிராமுக்கு' : 'per gram'}</small>
    </div>
  )
}
