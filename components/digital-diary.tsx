'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { OrderRecord, OrderStatus } from '@/lib/order-types'
import { useLanguage } from '@/lib/language'

type DiaryFilter = 'pending' | 'completed' | 'overdue' | 'all'
type OrderFormValues = {
  customerName: string
  jewelleryName: string
  advanceAmount: string
  orderDate: string
  deliveryDeadline: string
  additionalNotes: string
  sampleImage: string | null
}
type DueReminder = {
  reminderId: string
  orderId: string
  customerName: string
  jewelleryName: string
  advanceAmount: number
  deliveryDeadline: string
  reminderAt: string
  reminderVersion: number
}
type PushSettings = { enabled: boolean; publicKey: string | null }

const jewelleryOptions = [
  'Necklace',
  'Gold chain',
  'Haaram',
  'Choker',
  'Mangalsutra',
  'Pendant',
  'Earrings',
  'Jhumka',
  'Stud earrings',
  'Bangles',
  'Bracelet',
  'Ring',
  'Nose pin',
  'Anklet',
  'Waist belt',
  'Maang tikka',
  'Bridal set',
] as const

let reminderAudioContext: AudioContext | null = null

const emptyForm = (): OrderFormValues => ({
  customerName: '',
  jewelleryName: '',
  advanceAmount: '',
  orderDate: indiaToday(),
  deliveryDeadline: '',
  additionalNotes: '',
  sampleImage: null,
})

function indiaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatDate(value: string, language: 'en' | 'ta') {
  return new Intl.DateTimeFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`))
}

function formatAmount(value: number, language: 'en' | 'ta') {
  return new Intl.NumberFormat(language === 'ta' ? 'ta-IN' : 'en-IN', { style: 'currency', currency: 'INR' }).format(value)
}

function reminderTiming(deadline: string, t: (text: string) => string) {
  if (deadline < indiaToday()) return t('Past deadline')
  if (deadline === indiaToday()) return t('Due today')
  return t('Due tomorrow')
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
  const result = (await response.json()) as T & { error?: string }
  if (response.status === 401) window.location.assign('/login')
  if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.')
  return result
}

export function enableReminderSound() {
  if (!reminderAudioContext || reminderAudioContext.state === 'closed') {
    reminderAudioContext = new AudioContext()
  }
  return reminderAudioContext.resume()
}

function playReminderSound() {
  const context = reminderAudioContext
  if (!context || context.state !== 'running') return
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = 880
  oscillator.type = 'sine'
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.48)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.5)
}

export function DigitalDiary({
  createRequest,
  refreshKey,
  openOrderId,
  onCreateHandled,
  onOpenOrderHandled,
  onOrdersChanged,
  notify,
  soundEnabled,
  setSoundEnabled,
}: {
  createRequest: number
  refreshKey: number
  openOrderId: string | null
  onCreateHandled: () => void
  onOpenOrderHandled: () => void
  onOrdersChanged: () => void
  notify: (message: string) => void
  soundEnabled: boolean
  setSoundEnabled: (enabled: boolean) => void
}) {
  const { language, t } = useLanguage()
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [filter, setFilter] = useState<DiaryFilter>('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dialog, setDialog] = useState<'create' | 'edit' | 'view' | 'reschedule' | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null)
  const [form, setForm] = useState<OrderFormValues>(emptyForm)
  const [selectedJewelleryNames, setSelectedJewelleryNames] = useState<string[]>([])
  const [customJewelleryName, setCustomJewelleryName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setLoadError('')
    }
    try {
      const result = await requestJson<{ orders: OrderRecord[] }>('/api/orders')
      setOrders(result.orders)
      setLoadError('')
    } catch (error) {
      setLoadError(t(error instanceof Error ? error.message : 'Orders could not be loaded.'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadOrders()
    const interval = window.setInterval(() => void loadOrders(true), 60_000)
    return () => window.clearInterval(interval)
  }, [loadOrders, refreshKey])

  useEffect(() => {
    if (createRequest === 0) return
    setSelectedOrder(null)
    setForm(emptyForm())
    setSelectedJewelleryNames([])
    setCustomJewelleryName('')
    setFormError('')
    setDialog('create')
    onCreateHandled()
  }, [createRequest, onCreateHandled])

  useEffect(() => {
    if (!openOrderId) return
    let cancelled = false
    void requestJson<{ order: OrderRecord }>(`/api/orders/${openOrderId}`)
      .then(({ order }) => {
        if (cancelled) return
        setSelectedOrder(order)
        setDialog('view')
        onOpenOrderHandled()
      })
      .catch((error: unknown) => {
        if (!cancelled) notify(t(error instanceof Error ? error.message : 'Order could not be opened.'))
      })
    return () => {
      cancelled = true
    }
  }, [openOrderId, notify, onOpenOrderHandled, t])

  const counts = useMemo(
    () => ({
      pending: orders.filter((order) => order.status === 'pending').length,
      completed: orders.filter((order) => order.status === 'completed').length,
      overdue: orders.filter((order) => order.status === 'overdue').length,
      all: orders.length,
    }),
    [orders],
  )
  const visibleOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesFilter = filter === 'all' || order.status === filter
        const term = search.trim().toLocaleLowerCase()
        return (
          matchesFilter &&
          (!term ||
            order.customerName.toLocaleLowerCase().includes(term) ||
            order.jewelleryName.toLocaleLowerCase().includes(term))
        )
      }),
    [filter, orders, search],
  )

  function openNewOrder() {
    setSelectedOrder(null)
    setForm(emptyForm())
    setSelectedJewelleryNames([])
    setCustomJewelleryName('')
    setFormError('')
    setDialog('create')
  }

  function loadJewellerySelection(value: string) {
    const names = value.split(' · ').map((name) => name.trim()).filter(Boolean)
    const selected = names.filter((name) => jewelleryOptions.some((option) => option === name))
    const custom = names.filter((name) => !jewelleryOptions.some((option) => option === name)).join(' · ')
    setSelectedJewelleryNames(selected)
    setCustomJewelleryName(custom)
  }

  function updateJewelleryName(names: string[], customName: string) {
    const values = [...names, customName.trim()].filter(Boolean)
    setForm((current) => ({ ...current, jewelleryName: values.join(' · ') }))
  }

  function editOrder(order: OrderRecord) {
    void requestJson<{ order: OrderRecord }>(`/api/orders/${order.id}`)
      .then(({ order: details }) => {
        setSelectedOrder(details)
        setForm(orderToForm(details))
        loadJewellerySelection(details.jewelleryName)
        setFormError('')
        setDialog('edit')
      })
      .catch((error: unknown) => notify(t(error instanceof Error ? error.message : 'Order could not be opened.')))
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (form.deliveryDeadline < form.orderDate) {
      setFormError(t('Delivery deadline cannot be before the order date.'))
      return
    }
    setSaving(true)
    try {
      const editing = dialog === 'edit' && selectedOrder
      const result = await requestJson<{ order: OrderRecord; warning?: string }>(
        editing ? `/api/orders/${selectedOrder.id}` : '/api/orders',
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify({ ...form, advanceAmount: Number(form.advanceAmount) }),
        },
      )
      setDialog(null)
      await loadOrders()
      onOrdersChanged()
      notify(t(result.warning ?? (editing ? 'Order updated' : 'New order saved')))
    } catch (error) {
      setFormError(t(error instanceof Error ? error.message : 'Order could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  async function markCompleted(order: OrderRecord) {
    if (!window.confirm(`${t('Mark')} ${order.jewelleryName} ${t('for')} ${order.customerName} ${t('as completed?')}`)) return
    try {
      await requestJson(`/api/orders/${order.id}/complete`, { method: 'POST' })
      setDialog(null)
      await loadOrders()
      onOrdersChanged()
      notify(t('Order marked as completed'))
    } catch (error) {
      notify(t(error instanceof Error ? error.message : 'Order could not be completed.'))
    }
  }

  async function deleteOrder(order: OrderRecord) {
    if (!window.confirm(`${t('Delete order for')} ${order.customerName} (${order.jewelleryName})? ${t('This cannot be undone.')}`)) return
    setDeletingOrderId(order.id)
    try {
      await requestJson(`/api/orders/${order.id}`, { method: 'DELETE' })
      if (selectedOrder?.id === order.id) setDialog(null)
      await loadOrders()
      onOrdersChanged()
      notify(t('Order deleted'))
    } catch (error) {
      notify(t(error instanceof Error ? error.message : 'The order could not be deleted.'))
    } finally {
      setDeletingOrderId(null)
    }
  }

  async function saveDeadline(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrder) return
    if (deadline < selectedOrder.orderDate) {
      setFormError(t('Delivery deadline cannot be before the order date.'))
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const result = await requestJson<{ order: OrderRecord; warning?: string }>(`/api/orders/${selectedOrder.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryDeadline: deadline }),
      })
      setDialog(null)
      await loadOrders()
      onOrdersChanged()
      notify(t(result.warning ?? 'Delivery deadline updated and reminder rescheduled'))
    } catch (error) {
      setFormError(t(error instanceof Error ? error.message : 'Deadline could not be rescheduled.'))
    } finally {
      setSaving(false)
    }
  }

  function openReschedule(order: OrderRecord) {
    setSelectedOrder(order)
    setDeadline(order.deliveryDeadline)
    setFormError('')
    setDialog('reschedule')
  }

  function viewOrder(order: OrderRecord) {
    void requestJson<{ order: OrderRecord }>(`/api/orders/${order.id}`)
      .then(({ order: details }) => {
        setSelectedOrder(details)
        setDialog('view')
      })
      .catch((error: unknown) => notify(t(error instanceof Error ? error.message : 'Order could not be opened.')))
  }

  async function chooseSampleImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const sampleImage = await compressSampleImage(file)
      setForm((current) => ({ ...current, sampleImage }))
      setFormError('')
    } catch (error) {
      console.error('Could not process sample jewellery image:', error)
      setFormError(t('Sample image could not be processed. Choose a JPEG, PNG, or WebP image.'))
    }
  }

  return (
    <div className="content-wrap diary-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('Orders · Asia/Kolkata')}</p>
          <h1>{t('Orders')}<span>.</span></h1>
          <p className="subheading">{t('Every order, note, and delivery milestone in one calm workspace.')}</p>
        </div>
        <button className="primary-button" onClick={openNewOrder}><Plus size={17} /> {t('Add new order')}</button>
      </div>

      <div className="diary-toolbar">
        <div className="diary-filters" role="tablist" aria-label={t('Filter orders')}>
          {([
            ['pending', t('Pending')],
            ['completed', t('Completed')],
            ['overdue', t('Overdue')],
            ['all', t('All orders')],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={`diary-filter ${filter === value ? 'diary-filter-active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {label}<span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <label className="diary-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search customer or jewellery')}
            aria-label={t('Search orders')}
          />
        </label>
      </div>

      <section className="panel diary-orders-panel">
        <div className="panel-heading">
          <div>
            <h2>{filter === 'all' ? t('All orders') : `${t(filter)} ${t('orders')}`}</h2>
            <p>{filter === 'overdue' ? t('Past-deadline orders that still need attention.') : filter === 'completed' ? t('Finished work from your workshop.') : t('Order details, advances, dates, and delivery progress.')}</p>
          </div>
          <button className="secondary-button diary-refresh" onClick={() => void loadOrders()} disabled={loading}>
            {loading ? <LoaderCircle size={15} className="spin" /> : <Clock3 size={15} />} {t('Refresh')}
          </button>
        </div>

        {loadError ? (
          <div className="diary-error" role="alert"><p>{loadError}</p><button className="secondary-button" onClick={() => void loadOrders()}>{t('Try again')}</button></div>
        ) : loading ? (
          <div className="diary-loading"><LoaderCircle size={20} className="spin" /> {t('Loading saved orders…')}</div>
        ) : visibleOrders.length === 0 ? (
          <div className="diary-empty">
            <div className="empty-icon"><FileText size={22} /></div>
            <h3>{search ? t('No matching orders') : filter === 'completed' ? t('No completed orders yet') : filter === 'overdue' ? t('No overdue orders') : t('Your diary is ready')}</h3>
            <p>{search ? t('Try a different customer or jewellery name.') : filter === 'pending' || filter === 'all' ? t('Add your first order and its delivery reminder will be scheduled automatically.') : t('Orders in this section will appear here.')}</p>
            {(filter === 'pending' || filter === 'all') && !search && <button className="primary-button" onClick={openNewOrder}><Plus size={16} /> {t('Add new order')}</button>}
          </div>
        ) : (
          <div className="diary-table-scroll">
            <table className="diary-table">
              <thead><tr><th>{t('Customer')}</th><th>{t('Jewellery')}</th><th>{t('Advance received')}</th><th>{t('Order date')}</th><th>{t('Delivery deadline')}</th><th>{t('Status')}</th><th><span className="visually-hidden">{t('Order actions')}</span></th></tr></thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="diary-customer" data-label={t('Customer')}>{order.customerName}</td>
                    <td data-label={t('Jewellery')}>{order.jewelleryName}</td>
                    <td className="diary-amount" data-label={t('Advance received')}>{formatAmount(order.advanceAmount, language)}</td>
                    <td data-label={t('Order date')}>{formatDate(order.orderDate, language)}</td>
                    <td data-label={t('Delivery deadline')}>{formatDate(order.deliveryDeadline, language)}</td>
                    <td data-label={t('Status')}><OrderStatusBadge status={order.status} /></td>
                    <td data-label=""><div className="diary-row-actions">
                      <button className="row-icon-button" title={t('View order')} aria-label={`${t('View')} ${order.jewelleryName}`} onClick={() => viewOrder(order)}><Eye size={15} /></button>
                      <button className="row-icon-button" title={t('Edit order')} aria-label={`${t('Edit')} ${order.jewelleryName}`} onClick={() => editOrder(order)}><Pencil size={15} /></button>
                      {order.status !== 'completed' && <>
                        <button className="row-icon-button" title={t('Reschedule deadline')} aria-label={`${t('Reschedule')} ${order.jewelleryName}`} onClick={() => openReschedule(order)}><Clock3 size={15} /></button>
                        <button className="row-icon-button row-complete-button" title={t('Mark as completed')} aria-label={`${t('Mark')} ${order.jewelleryName} ${t('as completed')}`} onClick={() => void markCompleted(order)}><Check size={16} /></button>
                      </>}
                      <button
                        className="row-icon-button row-delete-button"
                        title={t('Delete order')}
                        aria-label={`${t('Delete order for')} ${order.customerName}`}
                        disabled={deletingOrderId === order.id}
                        onClick={() => void deleteOrder(order)}
                      ><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReminderSoundSettings enabled={soundEnabled} onChange={setSoundEnabled} />

      {dialog && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <section className="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
            <header className="order-modal-header">
              <div>
                <p className="eyebrow">{t(dialog === 'create' ? 'NEW WORKSHOP ORDER' : dialog === 'view' ? 'ORDER DETAILS' : dialog === 'reschedule' ? 'DELIVERY DATE' : 'UPDATE ORDER')}</p>
                <h2 id="order-modal-title">{t(dialog === 'create' ? 'Add new order' : dialog === 'view' ? 'Order details' : dialog === 'reschedule' ? 'Reschedule deadline' : 'Edit order')}</h2>
              </div>
              <button className="close-button" onClick={() => setDialog(null)} aria-label={t('Close order form')}><X size={19} /></button>
            </header>
            {(dialog === 'create' || dialog === 'edit') && (
              <form className="order-form" onSubmit={saveOrder}>
                <div className="form-grid">
                  <label className="form-field"><span>{t('Customer name')} <b>*</b></span><input autoFocus maxLength={160} required value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder={t('e.g. Meera Shah')} /></label>
                  <div className="form-field form-field-wide" role="group" aria-label={t('Jewellery name')}>
                    <span>{t('Jewellery name')} <b>*</b></span>
                    <details className="jewellery-picker">
                      <summary>
                        <span>{selectedJewelleryNames.length ? selectedJewelleryNames.map((name) => t(name)).join(', ') : t('Choose jewellery types')}</span>
                        <ChevronDown size={16} aria-hidden="true" />
                      </summary>
                      <div className="jewellery-options">
                        {jewelleryOptions.map((name) => (
                          <label className="jewellery-option" key={name}>
                            <input
                              type="checkbox"
                              checked={selectedJewelleryNames.includes(name)}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...selectedJewelleryNames, name]
                                  : selectedJewelleryNames.filter((selected) => selected !== name)
                                setSelectedJewelleryNames(next)
                                updateJewelleryName(next, customJewelleryName)
                              }}
                            />
                            <span>{t(name)}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                    <label className="form-field custom-jewellery-field">
                      <span>{t('Other jewellery name')}</span>
                      <input
                        maxLength={160}
                        value={customJewelleryName}
                        onChange={(event) => {
                          setCustomJewelleryName(event.target.value)
                          updateJewelleryName(selectedJewelleryNames, event.target.value)
                        }}
                        placeholder={t('Add another jewellery name')}
                      />
                    </label>
                    <span className="form-hint">{t('Select all jewellery items included in this order.')}</span>
                  </div>
                  <label className="form-field"><span>{t('Advance amount received (₹)')} <b>*</b></span><input type="number" min="0" max="9999999999.99" step="0.01" required value={form.advanceAmount} onChange={(event) => setForm({ ...form, advanceAmount: event.target.value })} /></label>
                  <label className="form-field"><span>{t('Order date')} <b>*</b></span><input type="date" required value={form.orderDate} onChange={(event) => setForm({ ...form, orderDate: event.target.value })} /></label>
                  <label className="form-field form-field-wide"><span>{t('Delivery deadline')} <b>*</b></span><input type="date" required min={form.orderDate} value={form.deliveryDeadline} onChange={(event) => setForm({ ...form, deliveryDeadline: event.target.value })} /></label>
                  <label className="form-field form-field-wide"><span>{t('Additional notes')}</span><textarea rows={3} maxLength={5000} value={form.additionalNotes} onChange={(event) => setForm({ ...form, additionalNotes: event.target.value })} placeholder={t('Design preferences, measurements, or other workshop notes')} /></label>
                  <div className="form-field form-field-wide">
                    <span>{t('Customer sample jewellery image')}</span>
                    <label className="sample-image-upload">
                      <Plus size={16} /> {t(form.sampleImage ? 'Replace sample image' : 'Upload sample image')}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseSampleImage(event)} />
                    </label>
                    <p className="form-hint">{t('Attach a photo of the jewellery the customer provided. Images are resized and limited to 1 MB.')}</p>
                    {form.sampleImage && <div className="sample-image-preview"><img src={form.sampleImage} alt={t('Customer sample jewellery')} /><button type="button" className="secondary-button" onClick={() => setForm((current) => ({ ...current, sampleImage: null }))}><Trash2 size={14} /> {t('Remove image')}</button></div>}
                  </div>
                </div>
                {formError && <p className="form-error" role="alert">{formError}</p>}
                <p className="form-hint">{t('A reminder is scheduled for 9:00 AM IST, one day before delivery.')}</p>
                <footer className="order-modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>{t('Cancel')}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? t('Saving…') : t(dialog === 'create' ? 'Save order' : 'Save changes')}</button></footer>
              </form>
            )}
            {dialog === 'view' && selectedOrder && (
              <div className="order-details">
                <div className="details-grid">
                  <Detail label={t('Customer')} value={selectedOrder.customerName} />
                  <Detail label={t('Jewellery')} value={selectedOrder.jewelleryName} />
                  <Detail label={t('Advance received')} value={formatAmount(selectedOrder.advanceAmount, language)} />
                  <Detail label={t('Order date')} value={formatDate(selectedOrder.orderDate, language)} />
                  <Detail label={t('Delivery deadline')} value={formatDate(selectedOrder.deliveryDeadline, language)} />
                  <Detail label={t('Status')} value={<OrderStatusBadge status={selectedOrder.status} />} />
                </div>
                <div className="details-notes"><span>{t('Additional notes')}</span><p>{selectedOrder.additionalNotes || t('No additional notes.')}</p></div>
                {selectedOrder.sampleImage && <div className="order-sample-image"><span>{t('Customer sample jewellery')}</span><img src={selectedOrder.sampleImage} alt={t('Customer sample jewellery')} /></div>}
                <footer className="order-modal-actions">
                  {selectedOrder.status !== 'completed' && <button className="secondary-button" onClick={() => openReschedule(selectedOrder)}><Clock3 size={15} /> {t('Reschedule')}</button>}
                  <button className="secondary-button" onClick={() => editOrder(selectedOrder)}><Pencil size={15} /> {t('Edit')}</button>
                  {selectedOrder.status !== 'completed' && <button className="primary-button" onClick={() => void markCompleted(selectedOrder)}><Check size={15} /> {t('Mark completed')}</button>}
                </footer>
              </div>
            )}
            {dialog === 'reschedule' && selectedOrder && (
              <form className="order-form" onSubmit={saveDeadline}>
                <p className="reschedule-copy">{t('Change the delivery deadline for')} <strong>{selectedOrder.jewelleryName}</strong>. {t('Its existing reminder will be updated to match.')}</p>
                <label className="form-field"><span>{t('New delivery deadline')} <b>*</b></span><input type="date" required min={selectedOrder.orderDate} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
                {formError && <p className="form-error" role="alert">{formError}</p>}
                <footer className="order-modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>{t('Cancel')}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? t('Updating…') : t('Update deadline')}</button></footer>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function orderToForm(order: OrderRecord): OrderFormValues {
  return {
    customerName: order.customerName,
    jewelleryName: order.jewelleryName,
    advanceAmount: String(order.advanceAmount),
    orderDate: order.orderDate,
    deliveryDeadline: order.deliveryDeadline,
    additionalNotes: order.additionalNotes,
    sampleImage: order.sampleImage,
  }
}

function compressSampleImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('Unsupported sample image format.'))
  }

  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Image resizing is unavailable.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4) <= 1_000_000) {
          resolve(dataUrl)
          return
        }
      }
      reject(new Error('Sample image is too large to compress.'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image file could not be read.'))
    }
    image.src = objectUrl
  })
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useLanguage()
  return <span className={`diary-status diary-status-${status}`}><i />{t(status)}</span>
}

export function ReminderCenter({
  onViewOrder,
  onOrdersChanged,
  notify,
  soundEnabled,
  onEnableSound,
}: {
  onViewOrder: (id: string) => void
  onOrdersChanged: () => void
  notify: (message: string) => void
  soundEnabled: boolean
  onEnableSound: () => void
}) {
  const { language, t } = useLanguage()
  const [reminders, setReminders] = useState<DueReminder[]>([])
  const [busy, setBusy] = useState(false)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    let mounted = true
    async function checkReminders() {
      try {
        const result = await requestJson<{ reminders: DueReminder[] }>('/api/reminders/due')
        if (!mounted) return
        const fresh = result.reminders.filter((reminder) => !seen.current.has(`${reminder.reminderId}:${reminder.reminderVersion}`))
        if (!fresh.length) return
        fresh.forEach((reminder) => seen.current.add(`${reminder.reminderId}:${reminder.reminderVersion}`))
        setReminders((current) => {
          const changedOrders = new Set(fresh.map((reminder) => reminder.reminderId))
          return [...current.filter((reminder) => !changedOrders.has(reminder.reminderId)), ...fresh]
        })
        for (const reminder of fresh) {
          void requestJson('/api/reminders/due', {
            method: 'POST',
            body: JSON.stringify({ reminderId: reminder.reminderId }),
          }).catch((error: unknown) => console.error('Could not record reminder popup:', error))
        }
      } catch (error) {
        console.error('Could not check due reminders:', error)
      }
    }

    void checkReminders()
    const interval = window.setInterval(() => void checkReminders(), 30_000)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (reminders.length && soundEnabled) {
      try {
        playReminderSound()
      } catch (error) {
        console.error('Reminder sound could not be played:', error)
      }
    }
  }, [reminders, soundEnabled])

  const activeReminder = reminders[0]
  if (!activeReminder) return null

  async function dismiss() {
    setBusy(true)
    try {
      await requestJson(`/api/orders/${activeReminder.orderId}/reminder/dismiss`, { method: 'POST' })
      setReminders((current) => current.filter((item) => item.reminderId !== activeReminder.reminderId))
    } catch (error) {
      notify(t(error instanceof Error ? error.message : 'Reminder could not be dismissed.'))
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    setBusy(true)
    try {
      await requestJson(`/api/orders/${activeReminder.orderId}/complete`, { method: 'POST' })
      setReminders((current) => current.filter((item) => item.reminderId !== activeReminder.reminderId))
      onOrdersChanged()
      notify(t('Order marked as completed'))
    } catch (error) {
      notify(t(error instanceof Error ? error.message : 'Order could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  function view() {
    setReminders((current) => current.filter((item) => item.reminderId !== activeReminder.reminderId))
    onViewOrder(activeReminder.orderId)
  }

  return (
    <div className="reminder-backdrop">
      <section className="reminder-modal" role="alertdialog" aria-modal="true" aria-labelledby="reminder-title">
        <div className="reminder-glow"><Bell size={22} /></div>
        <p className="eyebrow">{t('Delivery reminder')} · {reminderTiming(activeReminder.deliveryDeadline, t)}</p>
        <h2 id="reminder-title">{activeReminder.customerName}</h2>
        <p className="reminder-jewellery">{activeReminder.jewelleryName}</p>
        <div className="reminder-details">
          <span>{t('Advance received')} <strong>{formatAmount(activeReminder.advanceAmount, language)}</strong></span>
          <span>{t('Delivery deadline')} <strong>{formatDate(activeReminder.deliveryDeadline, language)}</strong></span>
        </div>
        {!soundEnabled && <button className="reminder-enable-sound" onClick={onEnableSound}><Volume2 size={14} /> {t('Enable reminder sound')}</button>}
        <footer className="reminder-actions">
          <button className="secondary-button" onClick={() => void dismiss()} disabled={busy}><BellOff size={15} /> {t('Dismiss')}</button>
          <button className="secondary-button" onClick={view}><Eye size={15} /> {t('View order')}</button>
          <button className="primary-button" onClick={() => void complete()} disabled={busy}><CheckCircle2 size={15} /> {t('Mark completed')}</button>
        </footer>
      </section>
    </div>
  )
}

function ReminderSoundSettings({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const { t } = useLanguage()
  const [pushSettings, setPushSettings] = useState<PushSettings | null>(null)
  const [pushState, setPushState] = useState<'checking' | 'disabled' | 'enabled' | 'unsupported' | 'subscribed'>('checking')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')

  useEffect(() => {
    void requestJson<PushSettings>('/api/push/public-key')
      .then(async (settings) => {
        setPushSettings(settings)
        if (!settings.enabled) {
          setPushState('disabled')
          return
        }
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
          setPushState('unsupported')
          return
        }
        const registration = await navigator.serviceWorker.register('/sw.js')
        const subscription = await registration.pushManager.getSubscription()
        setPushState(subscription ? 'subscribed' : 'enabled')
      })
      .catch((error: unknown) => {
        setPushError(error instanceof Error ? error.message : 'Notification settings could not be loaded.')
        setPushState('disabled')
      })
  }, [])

  async function toggleSound() {
    if (enabled) {
      await reminderAudioContext?.close()
      reminderAudioContext = null
      onChange(false)
      return
    }
    try {
      await enableReminderSound()
      onChange(true)
      playReminderSound()
    } catch (error) {
      setPushError(t(error instanceof Error ? error.message : 'Sound could not be enabled in this browser.'))
    }
  }

  async function togglePush() {
    if (!pushSettings?.publicKey) return
    setPushBusy(true)
    setPushError('')
    try {
      if (pushState === 'subscribed') {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await requestJson('/api/push/subscribe', {
            method: 'DELETE',
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
          await subscription.unsubscribe()
        }
        setPushState('enabled')
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') throw new Error('Notification permission was not granted in the browser.')
        const registration = await navigator.serviceWorker.register('/sw.js')
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(pushSettings.publicKey),
        })
        await requestJson('/api/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) })
        setPushState('subscribed')
      }
    } catch (error) {
      setPushError(t(error instanceof Error ? error.message : 'Browser notifications could not be updated.'))
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <section className="notification-settings" aria-label={t('Reminder notification settings')}>
      <div className="notification-setting-copy">
        <span className="notification-setting-icon"><Bell size={17} /></span>
        <div><strong>{t('Delivery reminders')}</strong><p>{t('Scheduled for 9:00 AM IST, one day before each deadline. Click once to enable sound; browsers block automatic audio.')}</p></div>
      </div>
      <div className="notification-setting-actions">
        <button className="secondary-button settings-toggle" onClick={() => void toggleSound()} title={t('A one-time click is required because browsers block automatic audio playback.')}>
          {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}{enabled ? t('Sound on') : t('Enable sound')}
        </button>
        <button className="secondary-button settings-toggle" onClick={() => void togglePush()} disabled={pushBusy || pushState === 'checking' || pushState === 'disabled' || pushState === 'unsupported'}>
          {pushState === 'subscribed' ? <BellOff size={15} /> : <Bell size={15} />}
          {pushBusy ? t('Updating…') : pushState === 'checking' ? t('Checking push…') : pushState === 'subscribed' ? t('Push enabled') : pushState === 'unsupported' ? t('Push unavailable') : pushState === 'disabled' ? t('Push not configured') : t('Enable push')}
        </button>
      </div>
      {pushError && <p className="notification-setting-error" role="alert">{t(pushError)}</p>}
    </section>
  )
}

function decodeApplicationServerKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const raw = window.atob(padded)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}
