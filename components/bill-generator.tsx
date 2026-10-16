'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { useLanguage } from '@/lib/language'
import type { OrderRecord } from '@/lib/order-types'
import type { BillRecord } from '@/lib/bill-types'

type BillItem = { id: number; name: string; purity: string; weight: string }

function formatMoney(value: number, language: 'en' | 'ta') {
  return new Intl.NumberFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function numeric(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && value.trim() ? parsed : 0
}

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

export function BillGenerator({
  onSaved,
}: {
  onSaved: () => void
}) {
  const { language, t } = useLanguage()
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loadError, setLoadError] = useState('')
  const [orderId, setOrderId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [billDate, setBillDate] = useState(today)
  const [items, setItems] = useState<BillItem[]>([{ id: 1, name: '', purity: '916', weight: '' }])
  const [extraWeight, setExtraWeight] = useState('')
  const [purityDeduction, setPurityDeduction] = useState('')
  const [billableWeight, setBillableWeight] = useState('')
  const [ratePerGram, setRatePerGram] = useState('')
  const [makingCharge, setMakingCharge] = useState('')
  const [advance, setAdvance] = useState('')
  const [savedBillId, setSavedBillId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetch('/api/orders', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as { orders?: OrderRecord[]; error?: string }
        if (!response.ok) throw new Error(result.error ?? 'Orders could not be loaded.')
        if (!cancelled) {
          setOrders(result.orders ?? [])
          setLoadError('')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('Could not load orders for bill generation:', error)
          setLoadError(t(error instanceof Error ? error.message : 'Orders could not be loaded.'))
        }
      })
    return () => { cancelled = true }
  }, [t])

  const orderTotalWeight = useMemo(
    () => items.reduce((total, item) => total + numeric(item.weight), 0),
    [items],
  )
  const suggestedBillableWeight = Math.max(0, orderTotalWeight + numeric(extraWeight) - numeric(purityDeduction))
  const weightForBill = numeric(billableWeight)
  const goldAmount = weightForBill * numeric(ratePerGram)
  const totalAmount = goldAmount + numeric(makingCharge)
  const balance = totalAmount - numeric(advance)
  const selectedOrder = orders.find((order) => order.id === orderId)

  function updateWeight(nextItems: BillItem[], nextExtra = extraWeight, nextDeduction = purityDeduction) {
    setItems(nextItems)
    const suggested = Math.max(0, nextItems.reduce((sum, item) => sum + numeric(item.weight), 0) + numeric(nextExtra) - numeric(nextDeduction))
    setBillableWeight(suggested ? suggested.toFixed(3) : '')
  }

  function selectOrder(id: string) {
    setOrderId(id)
    setSavedBillId(null)
    setSaveError('')
    setSaveNotice('')
    setExtraWeight('')
    setPurityDeduction('')
    setBillableWeight('')
    const order = orders.find((record) => record.id === id)
    if (!order) {
      setCustomerName('')
      setAdvance('')
      setItems([{ id: Date.now(), name: '', purity: '916', weight: '' }])
      return
    }
    setCustomerName(order.customerName)
    setAdvance(order.advanceAmount.toFixed(2))
    const names = order.jewelleryName.split(' · ').map((name) => name.trim()).filter(Boolean)
    setItems(names.map((name, index) => ({ id: Date.now() + index, name, purity: '916', weight: '' })))
  }

  function addItem() {
    updateWeight([...items, { id: Date.now(), name: '', purity: '916', weight: '' }])
  }

  function resetBill() {
    setSavedBillId(null)
    setOrderId('')
    setCustomerName('')
    setBillDate(today())
    setItems([{ id: Date.now(), name: '', purity: '916', weight: '' }])
    setExtraWeight('')
    setPurityDeduction('')
    setBillableWeight('')
    setRatePerGram('')
    setMakingCharge('')
    setAdvance('')
    setSaveError('')
    setSaveNotice('')
  }

  async function saveBill() {
    setSaving(true)
    setSaveError('')
    setSaveNotice('')
    const billedWeight = billableWeight ? weightForBill : suggestedBillableWeight
    const billData = {
      items: items.map((item) => ({ name: item.name.trim(), purity: item.purity.trim(), weight: numeric(item.weight) })),
      extraWeight: numeric(extraWeight),
      purityDeduction: numeric(purityDeduction),
      billableWeight: billedWeight,
      ratePerGram: numeric(ratePerGram),
      makingCharge: numeric(makingCharge),
      advance: numeric(advance),
    }
    try {
      const response = await fetch(savedBillId ? `/api/bills/${savedBillId}` : '/api/bills', {
        method: savedBillId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          orderId: orderId || null,
          customerName,
          billDate,
          billData,
          totalAmount: billedWeight * numeric(ratePerGram) + numeric(makingCharge),
        }),
      })
      const result = (await response.json()) as { bill?: BillRecord; error?: string }
      if (!response.ok || !result.bill) throw new Error(result.error ?? 'The bill could not be saved.')
      setSavedBillId(result.bill.id)
      onSaved()
      setSaveNotice(t('Bill saved to reports.'))
    } catch (error) {
      console.error('Could not save bill:', error)
      setSaveError(t(error instanceof Error ? error.message : 'The bill could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  function downloadBill() {
    const billedWeight = billableWeight ? weightForBill : suggestedBillableWeight
    const itemRows = items.map((item) => `
      <tr><td>${escapeHtml(item.name || '—')}</td><td>${escapeHtml(item.purity || '—')}</td><td>${numeric(item.weight).toFixed(3)} g</td></tr>
    `).join('')
    const html = `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(t('JEWELLERY BILL'))} - ${escapeHtml(customerName || 'Kanthimathi')}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:36px;background:#f8f7f3;color:#302a24;font:14px Arial,Helvetica,sans-serif}.bill{max-width:760px;margin:auto;padding:36px;background:#fffefa;border:1px solid #ece8e0;border-radius:12px}.header{display:flex;align-items:center;gap:14px;padding-bottom:20px;border-bottom:1px solid #ded7cc}.mark{width:42px;height:42px;display:grid;place-items:center;border:1px solid #b68b4d;border-radius:10px;color:#8a6635;font:600 24px Georgia,serif}.brand p{margin:0 0 3px;color:#776e64;font-size:12px}.brand h1{margin:0;font:600 26px Georgia,serif}.title{margin-left:auto;text-align:right}.title span,.label{display:block;color:#756b60;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.title span{color:#8b6633;font-weight:700}.title strong{display:block;margin-top:6px;font-size:13px;font-weight:500}.customer{display:flex;justify-content:space-between;gap:20px;padding:18px 0;border-bottom:1px solid #eee9e1}.customer strong{display:block;margin-top:6px;font-size:16px}.customer .reference{text-align:right}table{width:100%;margin-top:22px;border-collapse:collapse;text-align:left}th,td{padding:11px 8px;border-bottom:1px solid #eee9e1}thead th{color:#73695e;font-size:10px;text-transform:uppercase;letter-spacing:.06em}td:last-child,tfoot td{text-align:right;white-space:nowrap}tfoot th{font-weight:500;text-align:left}.billable th,.billable td{border-top:1px solid #b68b4d;color:#44331b;font-weight:700}.amounts{display:grid;gap:12px;max-width:360px;margin:24px 0 0 auto}.amounts div{display:flex;justify-content:space-between;gap:16px}.amounts div span{color:#665d53}.amounts div strong{text-align:right;white-space:nowrap}.grand{padding-top:12px;border-top:1px solid #ded7cc;font-size:15px;font-weight:700}.balance{padding:13px;border-radius:8px;background:#f5efe4;font-size:15px;font-weight:700}.footer{margin-top:32px;padding-top:14px;border-top:1px solid #eee9e1;color:#776e64;text-align:center;font-size:12px}@media print{body{padding:0;background:#fff}.bill{max-width:none;padding:0;border:0;border-radius:0}}@media(max-width:560px){body{padding:12px}.bill{padding:20px}.brand h1{font-size:21px}}
  </style>
</head>
<body>
  <main class="bill">
    <header class="header"><div class="mark">K</div><div class="brand"><p>${escapeHtml(t('Goldsmith studio'))}</p><h1>Kanthimathi</h1></div><div class="title"><span>${escapeHtml(t('JEWELLERY BILL'))}</span><strong>${escapeHtml(billDate || '—')}</strong></div></header>
    <section class="customer"><div><span class="label">${escapeHtml(t('Customer name'))}</span><strong>${escapeHtml(customerName || '—')}</strong></div>${selectedOrder ? `<div class="reference"><span class="label">${escapeHtml(t('Order reference'))}</span><strong>${escapeHtml(`${selectedOrder.id.slice(0, 8).toUpperCase()} · ${selectedOrder.orderDate}`)}</strong></div>` : ''}</section>
    <table><thead><tr><th>${escapeHtml(t('Jewellery'))}</th><th>${escapeHtml(t('Purity'))}</th><th>${escapeHtml(t('Weight (g)'))}</th></tr></thead><tbody>${itemRows}</tbody><tfoot>
      <tr><th colspan="2">${escapeHtml(t('Item weight'))}</th><td>${orderTotalWeight.toFixed(3)} g</td></tr>
      <tr><th colspan="2">${escapeHtml(t('Extra weight'))}</th><td>+ ${numeric(extraWeight).toFixed(3)} g</td></tr>
      <tr><th colspan="2">${escapeHtml(t('Purity deduction'))}</th><td>− ${numeric(purityDeduction).toFixed(3)} g</td></tr>
      <tr class="billable"><th colspan="2">${escapeHtml(t('Billable weight'))}</th><td>${billedWeight.toFixed(3)} g</td></tr>
    </tfoot></table>
    <section class="amounts">
      <div><span>${billedWeight.toFixed(3)} g × ${numeric(ratePerGram).toLocaleString(language === 'ta' ? 'ta-IN' : 'en-IN')}</span><strong>${escapeHtml(formatMoney(billedWeight * numeric(ratePerGram), language))}</strong></div>
      <div><span>${escapeHtml(t('Making charge'))}</span><strong>${escapeHtml(formatMoney(numeric(makingCharge), language))}</strong></div>
      <div class="grand"><span>${escapeHtml(t('Total amount'))}</span><strong>${escapeHtml(formatMoney(totalAmount, language))}</strong></div>
      <div><span>${escapeHtml(t('Advance received'))}</span><strong>− ${escapeHtml(formatMoney(numeric(advance), language))}</strong></div>
      <div class="balance"><span>${escapeHtml(t('Balance due'))}</span><strong>${escapeHtml(formatMoney(balance, language))}</strong></div>
    </section>
    <footer class="footer">${escapeHtml(t('Thank you for your purchase.'))}</footer>
  </main>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `kanthimathi-bill-${billDate || today()}.html`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="content-wrap digital-diary-content">
      <div className="page-heading bill-page-heading">
        <div>
          <p className="eyebrow">{t('WORKSPACE')}</p>
          <h1>{t('Digital Diary')}<span>.</span></h1>
          <p className="subheading">{t('Prepare and print a jewellery weight bill.')}</p>
        </div>
        <div className="bill-toolbar">
          <button className="secondary-button" onClick={resetBill}>{t('Clear bill')}</button>
          <button className="secondary-button" onClick={() => void saveBill()} disabled={saving}><Save size={16} /> {saving ? t('Saving…') : t(savedBillId ? 'Update saved bill' : 'Save bill')}</button>
          <button className="secondary-button" onClick={downloadBill}><Download size={16} /> {t('Download bill')}</button>
          <button className="primary-button" onClick={() => window.print()}><Printer size={16} /> {t('Print bill')}</button>
        </div>
      </div>

      <div className="bill-workspace">
        <section className="panel bill-form">
          <div className="panel-heading">
            <div><h2>{t('Bill details')}</h2><p>{t('Enter jewellery weights and the gold rate.')}</p></div>
          </div>
          {loadError && <p className="form-error" role="alert">{loadError}</p>}
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          {saveNotice && <p className="bill-save-notice" role="status">{saveNotice}</p>}
          <label className="form-field bill-field">
            <span>{t('Copy details from order')}</span>
            <select value={orderId} onChange={(event) => selectOrder(event.target.value)}>
              <option value="">{t('Start a new bill')}</option>
              {orders.map((order) => <option key={order.id} value={order.id}>{order.customerName} · {order.jewelleryName}</option>)}
            </select>
          </label>
          <div className="bill-form-grid">
            <label className="form-field bill-field"><span>{t('Customer name')}</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
            <label className="form-field bill-field"><span>{t('Bill date')}</span><input type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} /></label>
          </div>

          <div className="bill-items-heading"><h3>{t('Jewellery and weight')}</h3><button className="secondary-button" onClick={addItem}><Plus size={14} /> {t('Add item')}</button></div>
          <div className="bill-items">
            {items.map((item, index) => (
              <div className="bill-item-row" key={item.id}>
                <label className="form-field bill-field"><span>{t('Jewellery')} {index + 1}</span><input value={item.name} onChange={(event) => updateWeight(items.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} placeholder={t('e.g. Necklace')} /></label>
                <label className="form-field bill-field"><span>{t('Purity')}</span><input value={item.purity} onChange={(event) => updateWeight(items.map((row) => row.id === item.id ? { ...row, purity: event.target.value } : row))} placeholder="916" /></label>
                <label className="form-field bill-field"><span>{t('Weight (g)')}</span><input type="number" min="0" step="0.001" value={item.weight} onChange={(event) => updateWeight(items.map((row) => row.id === item.id ? { ...row, weight: event.target.value } : row))} placeholder="0.000" /></label>
                <button className="row-icon-button row-delete-button bill-item-delete" aria-label={`${t('Remove')} ${item.name || t('Jewellery')}`} disabled={items.length === 1} onClick={() => updateWeight(items.filter((row) => row.id !== item.id))}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>

          <div className="bill-form-grid">
            <label className="form-field bill-field"><span>{t('Extra weight (g)')}</span><input type="number" step="0.001" value={extraWeight} onChange={(event) => { setExtraWeight(event.target.value); setBillableWeight(Math.max(0, orderTotalWeight + numeric(event.target.value) - numeric(purityDeduction)).toFixed(3)) }} /></label>
            <label className="form-field bill-field"><span>{t('Purity deduction (g)')}</span><input type="number" min="0" step="0.001" value={purityDeduction} onChange={(event) => { setPurityDeduction(event.target.value); setBillableWeight(Math.max(0, orderTotalWeight + numeric(extraWeight) - numeric(event.target.value)).toFixed(3)) }} /></label>
            <label className="form-field bill-field"><span>{t('Billable weight (g)')}</span><input type="number" min="0" step="0.001" value={billableWeight} onChange={(event) => setBillableWeight(event.target.value)} /></label>
            <label className="form-field bill-field"><span>{t('Rate per gram (₹)')}</span><input type="number" min="0" step="0.01" value={ratePerGram} onChange={(event) => setRatePerGram(event.target.value)} /></label>
            <label className="form-field bill-field"><span>{t('Making charge (₹)')}</span><input type="number" min="0" step="0.01" value={makingCharge} onChange={(event) => setMakingCharge(event.target.value)} /></label>
            <label className="form-field bill-field"><span>{t('Advance received (₹)')}</span><input type="number" min="0" step="0.01" value={advance} onChange={(event) => setAdvance(event.target.value)} /></label>
          </div>
          <p className="bill-calculation-hint">{t('Billable weight is calculated as item weight + extra weight − purity deduction. You can adjust it directly.')}</p>
        </section>

        <article className="print-bill">
          <header className="print-bill-header">
            <div className="print-brand-mark">K</div>
            <div><p>{t('Goldsmith studio')}</p><h2>Kanthimathi</h2></div>
            <div className="print-bill-title"><span>{t('JEWELLERY BILL')}</span><strong>{billDate || '—'}</strong></div>
          </header>
          <div className="print-customer">
            <div><span>{t('Customer name')}</span><strong>{customerName || '—'}</strong></div>
            {selectedOrder && <div><span>{t('Order reference')}</span><strong>{selectedOrder.id.slice(0, 8).toUpperCase()} · {selectedOrder.orderDate}</strong></div>}
          </div>
          <table className="print-items-table">
            <thead><tr><th>{t('Jewellery')}</th><th>{t('Purity')}</th><th>{t('Weight (g)')}</th></tr></thead>
            <tbody>
              {items.map((item) => <tr key={item.id}><td>{item.name || '—'}</td><td>{item.purity || '—'}</td><td>{numeric(item.weight).toFixed(3)}</td></tr>)}
            </tbody>
            <tfoot>
              <tr><th colSpan={2}>{t('Item weight')}</th><td>{orderTotalWeight.toFixed(3)} g</td></tr>
              <tr><th colSpan={2}>{t('Extra weight')}</th><td>+ {numeric(extraWeight).toFixed(3)} g</td></tr>
              <tr><th colSpan={2}>{t('Purity deduction')}</th><td>− {numeric(purityDeduction).toFixed(3)} g</td></tr>
              <tr className="print-billable"><th colSpan={2}>{t('Billable weight')}</th><td>{(billableWeight ? weightForBill : suggestedBillableWeight).toFixed(3)} g</td></tr>
            </tfoot>
          </table>
          <div className="print-amounts">
            <div><span>{(billableWeight ? weightForBill : suggestedBillableWeight).toFixed(3)} g × {numeric(ratePerGram).toLocaleString(language === 'ta' ? 'ta-IN' : 'en-IN')}</span><strong>{formatMoney((billableWeight ? weightForBill : suggestedBillableWeight) * numeric(ratePerGram), language)}</strong></div>
            <div><span>{t('Making charge')}</span><strong>{formatMoney(numeric(makingCharge), language)}</strong></div>
            <div className="print-grand-total"><span>{t('Total amount')}</span><strong>{formatMoney(totalAmount, language)}</strong></div>
            <div><span>{t('Advance received')}</span><strong>− {formatMoney(numeric(advance), language)}</strong></div>
            <div className="print-balance"><span>{t('Balance due')}</span><strong>{formatMoney(balance, language)}</strong></div>
          </div>
          <footer className="print-bill-footer">{t('Thank you for your purchase.')}</footer>
        </article>
      </div>
    </div>
  )
}
