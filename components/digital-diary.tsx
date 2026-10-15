'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { OrderRecord, OrderStatus } from '@/lib/order-types'

type DiaryFilter = 'pending' | 'completed' | 'overdue' | 'all'
type OrderFormValues = {
  customerName: string
  jewelleryName: string
  advanceAmount: string
  orderDate: string
  deliveryDeadline: string
  additionalNotes: string
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

let reminderAudioContext: AudioContext | null = null

const emptyForm = (): OrderFormValues => ({
  customerName: '',
  jewelleryName: '',
  advanceAmount: '',
  orderDate: indiaToday(),
  deliveryDeadline: '',
  additionalNotes: '',
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`))
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value)
}

function reminderTiming(deadline: string) {
  if (deadline < indiaToday()) return 'PAST DEADLINE'
  if (deadline === indiaToday()) return 'DUE TODAY'
  return 'DUE TOMORROW'
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
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [filter, setFilter] = useState<DiaryFilter>('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dialog, setDialog] = useState<'create' | 'edit' | 'view' | 'reschedule' | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null)
  const [form, setForm] = useState<OrderFormValues>(emptyForm)
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
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
      setLoadError(error instanceof Error ? error.message : 'Orders could not be loaded.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOrders()
    const interval = window.setInterval(() => void loadOrders(true), 60_000)
    return () => window.clearInterval(interval)
  }, [loadOrders, refreshKey])

  useEffect(() => {
    if (createRequest === 0) return
    setSelectedOrder(null)
    setForm(emptyForm())
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
        if (!cancelled) notify(error instanceof Error ? error.message : 'Order could not be opened.')
      })
    return () => {
      cancelled = true
    }
  }, [openOrderId, notify, onOpenOrderHandled])

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
    setFormError('')
    setDialog('create')
  }

  function editOrder(order: OrderRecord) {
    setSelectedOrder(order)
    setForm({
      customerName: order.customerName,
      jewelleryName: order.jewelleryName,
      advanceAmount: String(order.advanceAmount),
      orderDate: order.orderDate,
      deliveryDeadline: order.deliveryDeadline,
      additionalNotes: order.additionalNotes,
    })
    setFormError('')
    setDialog('edit')
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (form.deliveryDeadline < form.orderDate) {
      setFormError('Delivery deadline cannot be before the order date.')
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
      notify(result.warning ?? (editing ? 'Order updated' : 'New order saved'))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Order could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function markCompleted(order: OrderRecord) {
    if (!window.confirm(`Mark ${order.jewelleryName} for ${order.customerName} as completed?`)) return
    try {
      await requestJson(`/api/orders/${order.id}/complete`, { method: 'POST' })
      setDialog(null)
      await loadOrders()
      onOrdersChanged()
      notify('Order marked as completed')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Order could not be completed.')
    }
  }

  async function saveDeadline(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrder) return
    if (deadline < selectedOrder.orderDate) {
      setFormError('Delivery deadline cannot be before the order date.')
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
      notify(result.warning ?? 'Delivery deadline updated and reminder rescheduled')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Deadline could not be rescheduled.')
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
    setSelectedOrder(order)
    setDialog('view')
  }

  return (
    <div className="content-wrap diary-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORDERS · ASIA/KOLKATA</p>
          <h1>Digital diary<span>.</span></h1>
          <p className="subheading">Every order, note, and delivery milestone in one calm workspace.</p>
        </div>
        <button className="primary-button" onClick={openNewOrder}><Plus size={17} /> Add new order</button>
      </div>

      <div className="diary-toolbar">
        <div className="diary-filters" role="tablist" aria-label="Filter orders">
          {([
            ['pending', 'Pending'],
            ['completed', 'Completed'],
            ['overdue', 'Overdue'],
            ['all', 'All orders'],
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
            placeholder="Search customer or jewellery"
            aria-label="Search orders"
          />
        </label>
      </div>

      <section className="panel diary-orders-panel">
        <div className="panel-heading">
          <div>
            <h2>{filter === 'all' ? 'All orders' : `${filter[0].toUpperCase()}${filter.slice(1)} orders`}</h2>
            <p>{filter === 'overdue' ? 'Past-deadline orders that still need attention.' : filter === 'completed' ? 'Finished work from your workshop.' : 'Order details, advances, dates, and delivery progress.'}</p>
          </div>
          <button className="secondary-button diary-refresh" onClick={() => void loadOrders()} disabled={loading}>
            {loading ? <LoaderCircle size={15} className="spin" /> : <Clock3 size={15} />} Refresh
          </button>
        </div>

        {loadError ? (
          <div className="diary-error" role="alert"><p>{loadError}</p><button className="secondary-button" onClick={() => void loadOrders()}>Try again</button></div>
        ) : loading ? (
          <div className="diary-loading"><LoaderCircle size={20} className="spin" /> Loading saved orders…</div>
        ) : visibleOrders.length === 0 ? (
          <div className="diary-empty">
            <div className="empty-icon"><FileText size={22} /></div>
            <h3>{search ? 'No matching orders' : filter === 'completed' ? 'No completed orders yet' : filter === 'overdue' ? 'No overdue orders' : 'Your diary is ready'}</h3>
            <p>{search ? 'Try a different customer or jewellery name.' : filter === 'pending' || filter === 'all' ? 'Add your first order and its delivery reminder will be scheduled automatically.' : 'Orders in this section will appear here.'}</p>
            {(filter === 'pending' || filter === 'all') && !search && <button className="primary-button" onClick={openNewOrder}><Plus size={16} /> Add new order</button>}
          </div>
        ) : (
          <div className="diary-table-scroll">
            <table className="diary-table">
              <thead><tr><th>Customer</th><th>Jewellery</th><th>Advance received</th><th>Order date</th><th>Delivery deadline</th><th>Status</th><th><span className="visually-hidden">Order actions</span></th></tr></thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="diary-customer">{order.customerName}</td>
                    <td>{order.jewelleryName}</td>
                    <td className="diary-amount">{formatAmount(order.advanceAmount)}</td>
                    <td>{formatDate(order.orderDate)}</td>
                    <td>{formatDate(order.deliveryDeadline)}</td>
                    <td><OrderStatusBadge status={order.status} /></td>
                    <td><div className="diary-row-actions">
                      <button className="row-icon-button" title="View order" aria-label={`View ${order.jewelleryName}`} onClick={() => viewOrder(order)}><Eye size={15} /></button>
                      <button className="row-icon-button" title="Edit order" aria-label={`Edit ${order.jewelleryName}`} onClick={() => editOrder(order)}><Pencil size={15} /></button>
                      {order.status !== 'completed' && <>
                        <button className="row-icon-button" title="Reschedule deadline" aria-label={`Reschedule ${order.jewelleryName}`} onClick={() => openReschedule(order)}><Clock3 size={15} /></button>
                        <button className="row-icon-button row-complete-button" title="Mark as completed" aria-label={`Mark ${order.jewelleryName} as completed`} onClick={() => void markCompleted(order)}><Check size={16} /></button>
                      </>}
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
                <p className="eyebrow">{dialog === 'create' ? 'NEW WORKSHOP ORDER' : dialog === 'view' ? 'ORDER DETAILS' : dialog === 'reschedule' ? 'DELIVERY DATE' : 'UPDATE ORDER'}</p>
                <h2 id="order-modal-title">{dialog === 'create' ? 'Add new order' : dialog === 'view' ? 'Order details' : dialog === 'reschedule' ? 'Reschedule deadline' : 'Edit order'}</h2>
              </div>
              <button className="close-button" onClick={() => setDialog(null)} aria-label="Close order form"><X size={19} /></button>
            </header>
            {(dialog === 'create' || dialog === 'edit') && (
              <form className="order-form" onSubmit={saveOrder}>
                <div className="form-grid">
                  <label className="form-field"><span>Customer name <b>*</b></span><input autoFocus maxLength={160} required value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="e.g. Meera Shah" /></label>
                  <label className="form-field"><span>Jewellery name <b>*</b></span><input maxLength={160} required value={form.jewelleryName} onChange={(event) => setForm({ ...form, jewelleryName: event.target.value })} placeholder="e.g. Bridal necklace" /></label>
                  <label className="form-field"><span>Advance amount received (₹) <b>*</b></span><input type="number" min="0" max="9999999999.99" step="0.01" required value={form.advanceAmount} onChange={(event) => setForm({ ...form, advanceAmount: event.target.value })} /></label>
                  <label className="form-field"><span>Order date <b>*</b></span><input type="date" required value={form.orderDate} onChange={(event) => setForm({ ...form, orderDate: event.target.value })} /></label>
                  <label className="form-field form-field-wide"><span>Delivery deadline <b>*</b></span><input type="date" required min={form.orderDate} value={form.deliveryDeadline} onChange={(event) => setForm({ ...form, deliveryDeadline: event.target.value })} /></label>
                  <label className="form-field form-field-wide"><span>Additional notes</span><textarea rows={3} maxLength={5000} value={form.additionalNotes} onChange={(event) => setForm({ ...form, additionalNotes: event.target.value })} placeholder="Design preferences, measurements, or other workshop notes" /></label>
                </div>
                {formError && <p className="form-error" role="alert">{formError}</p>}
                <p className="form-hint">A reminder is scheduled for 9:00 AM IST, one day before delivery.</p>
                <footer className="order-modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : dialog === 'create' ? 'Save order' : 'Save changes'}</button></footer>
              </form>
            )}
            {dialog === 'view' && selectedOrder && (
              <div className="order-details">
                <div className="details-grid">
                  <Detail label="Customer" value={selectedOrder.customerName} />
                  <Detail label="Jewellery" value={selectedOrder.jewelleryName} />
                  <Detail label="Advance received" value={formatAmount(selectedOrder.advanceAmount)} />
                  <Detail label="Order date" value={formatDate(selectedOrder.orderDate)} />
                  <Detail label="Delivery deadline" value={formatDate(selectedOrder.deliveryDeadline)} />
                  <Detail label="Status" value={<OrderStatusBadge status={selectedOrder.status} />} />
                </div>
                <div className="details-notes"><span>Additional notes</span><p>{selectedOrder.additionalNotes || 'No additional notes.'}</p></div>
                <footer className="order-modal-actions">
                  {selectedOrder.status !== 'completed' && <button className="secondary-button" onClick={() => openReschedule(selectedOrder)}><Clock3 size={15} /> Reschedule</button>}
                  <button className="secondary-button" onClick={() => editOrder(selectedOrder)}><Pencil size={15} /> Edit</button>
                  {selectedOrder.status !== 'completed' && <button className="primary-button" onClick={() => void markCompleted(selectedOrder)}><Check size={15} /> Mark completed</button>}
                </footer>
              </div>
            )}
            {dialog === 'reschedule' && selectedOrder && (
              <form className="order-form" onSubmit={saveDeadline}>
                <p className="reschedule-copy">Change the delivery deadline for <strong>{selectedOrder.jewelleryName}</strong>. Its existing reminder will be updated to match.</p>
                <label className="form-field"><span>New delivery deadline <b>*</b></span><input type="date" required min={selectedOrder.orderDate} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
                {formError && <p className="form-error" role="alert">{formError}</p>}
                <footer className="order-modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Updating…' : 'Update deadline'}</button></footer>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`diary-status diary-status-${status}`}><i />{status}</span>
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
      notify(error instanceof Error ? error.message : 'Reminder could not be dismissed.')
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
      notify('Order marked as completed')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Order could not be completed.')
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
        <p className="eyebrow">DELIVERY REMINDER · {reminderTiming(activeReminder.deliveryDeadline)}</p>
        <h2 id="reminder-title">{activeReminder.customerName}</h2>
        <p className="reminder-jewellery">{activeReminder.jewelleryName}</p>
        <div className="reminder-details">
          <span>Advance received <strong>{formatAmount(activeReminder.advanceAmount)}</strong></span>
          <span>Delivery deadline <strong>{formatDate(activeReminder.deliveryDeadline)}</strong></span>
        </div>
        {!soundEnabled && <button className="reminder-enable-sound" onClick={onEnableSound}><Volume2 size={14} /> Enable reminder sound</button>}
        <footer className="reminder-actions">
          <button className="secondary-button" onClick={() => void dismiss()} disabled={busy}><BellOff size={15} /> Dismiss</button>
          <button className="secondary-button" onClick={view}><Eye size={15} /> View order</button>
          <button className="primary-button" onClick={() => void complete()} disabled={busy}><CheckCircle2 size={15} /> Mark completed</button>
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
      setPushError(error instanceof Error ? error.message : 'Sound could not be enabled in this browser.')
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
      setPushError(error instanceof Error ? error.message : 'Browser notifications could not be updated.')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <section className="notification-settings" aria-label="Reminder notification settings">
      <div className="notification-setting-copy">
        <span className="notification-setting-icon"><Bell size={17} /></span>
        <div><strong>Delivery reminders</strong><p>Scheduled for 9:00 AM IST, one day before each deadline. Click once to enable sound; browsers block automatic audio.</p></div>
      </div>
      <div className="notification-setting-actions">
        <button className="secondary-button settings-toggle" onClick={() => void toggleSound()} title="A one-time click is required because browsers block automatic audio playback.">
          {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}{enabled ? 'Sound on' : 'Enable sound'}
        </button>
        <button className="secondary-button settings-toggle" onClick={() => void togglePush()} disabled={pushBusy || pushState === 'checking' || pushState === 'disabled' || pushState === 'unsupported'}>
          {pushState === 'subscribed' ? <BellOff size={15} /> : <Bell size={15} />}
          {pushBusy ? 'Updating…' : pushState === 'checking' ? 'Checking push…' : pushState === 'subscribed' ? 'Push enabled' : pushState === 'unsupported' ? 'Push unavailable' : pushState === 'disabled' ? 'Push not configured' : 'Enable push'}
        </button>
      </div>
      {pushError && <p className="notification-setting-error" role="alert">{pushError}</p>}
    </section>
  )
}

function decodeApplicationServerKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const raw = window.atob(padded)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}
