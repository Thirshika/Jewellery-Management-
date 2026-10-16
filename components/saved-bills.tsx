'use client'

import { useEffect, useState } from 'react'
import { FileText, LoaderCircle, Printer, X } from 'lucide-react'
import { useLanguage } from '@/lib/language'
import type { BillRecord } from '@/lib/bill-types'

function formatBillDate(value: string, language: 'en' | 'ta') {
  return new Intl.DateTimeFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`))
}

function formatBillAmount(value: number, language: 'en' | 'ta') {
  return new Intl.NumberFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

export function SavedBills({
  refreshKey,
}: {
  refreshKey: number
}) {
  const { language, t } = useLanguage()
  const [bills, setBills] = useState<BillRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [openBillId, setOpenBillId] = useState<string | null>(null)
  const openBill = bills.find((bill) => bill.id === openBillId) ?? null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetch('/api/bills', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as { bills?: BillRecord[]; error?: string }
        if (!response.ok) throw new Error(result.error ?? 'Saved bills could not be loaded.')
        if (!cancelled) {
          setBills(result.bills ?? [])
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          console.error('Could not load saved bills:', cause)
          setError(t(cause instanceof Error ? cause.message : 'Saved bills could not be loaded.'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshKey, retryKey, t])

  return (
    <div className="content-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('MANAGE')}</p>
          <h1>{t('Reports')}<span>.</span></h1>
          <p className="subheading">{t('Saved jewellery bills and payment summaries.')}</p>
        </div>
      </div>
      <section className="panel saved-bills-panel">
        <div className="panel-heading">
          <div><h2>{t('Saved bills')}</h2><p>{t('Bills saved from Digital Diary appear here.')}</p></div>
          <span className="saved-bills-count">{bills.length}</span>
        </div>
        {error ? <div className="diary-error" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setRetryKey((value) => value + 1)}>{t('Try again')}</button></div> : loading ? (
          <div className="diary-loading"><LoaderCircle size={18} className="spin" /> {t('Loading saved bills…')}</div>
        ) : bills.length === 0 ? (
          <div className="diary-empty"><div className="empty-icon"><FileText size={20} /></div><h3>{t('No saved bills yet')}</h3><p>{t('Create a bill in Digital Diary and select Save bill to keep it here.')}</p></div>
        ) : (
          <div className="saved-bills-list">
            {bills.map((bill) => (
              <article className="saved-bill-row" key={bill.id}>
                <div className="saved-bill-icon"><FileText size={18} /></div>
                <div className="saved-bill-info">
                  <strong>{bill.customerName}</strong>
                  <span>{formatBillDate(bill.billDate, language)}{bill.orderId ? ` · ${t('Order')} ${bill.orderId.slice(0, 8).toUpperCase()}` : ''}</span>
                  <small>{bill.billData.items.map((item) => item.name).join(', ')}</small>
                </div>
                <strong className="saved-bill-total">{formatBillAmount(bill.totalAmount, language)}</strong>
                <button
                  className="secondary-button"
                  aria-expanded={openBillId === bill.id}
                  onClick={() => setOpenBillId((current) => current === bill.id ? null : bill.id)}
                >{t(openBillId === bill.id ? 'Close bill' : 'Open bill')}</button>
              </article>
            ))}
          </div>
        )}
        {openBill && <SavedBillPreview bill={openBill} onClose={() => setOpenBillId(null)} />}
      </section>
    </div>
  )
}

function SavedBillPreview({ bill, onClose }: { bill: BillRecord; onClose: () => void }) {
  const { language, t } = useLanguage()
  const { billData } = bill
  const goldAmount = billData.billableWeight * billData.ratePerGram
  const balance = bill.totalAmount - billData.advance
  return (
    <section className="saved-bill-preview" aria-label={t('Saved bill preview')}>
      <div className="saved-bill-preview-toolbar">
        <h2>{t('Saved bill preview')}</h2>
        <div>
          <button className="secondary-button" onClick={() => window.print()}><Printer size={15} /> {t('Print bill')}</button>
          <button className="row-icon-button" aria-label={t('Close bill')} onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <article className="print-bill saved-print-bill">
        <header className="print-bill-header">
          <div className="print-brand-mark">K</div>
          <div><p>{t('Goldsmith studio')}</p><h2>Kanthimathi</h2></div>
          <div className="print-bill-title"><span>{t('JEWELLERY BILL')}</span><strong>{formatBillDate(bill.billDate, language)}</strong></div>
        </header>
        <div className="print-customer">
          <div><span>{t('Customer name')}</span><strong>{bill.customerName}</strong></div>
          {bill.orderId && <div><span>{t('Order reference')}</span><strong>{bill.orderId.slice(0, 8).toUpperCase()}</strong></div>}
        </div>
        <table className="print-items-table">
          <thead><tr><th>{t('Jewellery')}</th><th>{t('Purity')}</th><th>{t('Weight (g)')}</th></tr></thead>
          <tbody>{billData.items.map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td>{item.purity || '—'}</td><td>{item.weight.toFixed(3)} g</td></tr>)}</tbody>
          <tfoot>
            <tr><th colSpan={2}>{t('Item weight')}</th><td>{billData.items.reduce((sum, item) => sum + item.weight, 0).toFixed(3)} g</td></tr>
            <tr><th colSpan={2}>{t('Extra weight')}</th><td>+ {billData.extraWeight.toFixed(3)} g</td></tr>
            <tr><th colSpan={2}>{t('Purity deduction')}</th><td>− {billData.purityDeduction.toFixed(3)} g</td></tr>
            <tr className="print-billable"><th colSpan={2}>{t('Billable weight')}</th><td>{billData.billableWeight.toFixed(3)} g</td></tr>
          </tfoot>
        </table>
        <div className="print-amounts">
          <div><span>{billData.billableWeight.toFixed(3)} g × {billData.ratePerGram.toLocaleString(language === 'ta' ? 'ta-IN' : 'en-IN')}</span><strong>{formatBillAmount(goldAmount, language)}</strong></div>
          <div><span>{t('Making charge')}</span><strong>{formatBillAmount(billData.makingCharge, language)}</strong></div>
          <div className="print-grand-total"><span>{t('Total amount')}</span><strong>{formatBillAmount(bill.totalAmount, language)}</strong></div>
          <div><span>{t('Advance received')}</span><strong>− {formatBillAmount(billData.advance, language)}</strong></div>
          <div className="print-balance"><span>{t('Balance due')}</span><strong>{formatBillAmount(balance, language)}</strong></div>
        </div>
        <footer className="print-bill-footer">{t('Thank you for your purchase.')}</footer>
      </article>
    </section>
  )
}
