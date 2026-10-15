'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Gem,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Plus,
  Settings,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { DigitalDiary, enableReminderSound, ReminderCenter } from '@/components/digital-diary'
import type { OrderRecord, OrderStatus } from '@/lib/order-types'

const designs = [
  ['GD-104', 'Lakshmi Haaram', 'Necklaces', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=85'],
  ['GD-087', 'Kundan Choker', 'Bridal', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=600&q=85'],
  ['GD-112', 'Mango Nakshi Bangle', 'Bangles', 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=600&q=85'],
]
const nav = [
  ['Overview', LayoutDashboard],
  ['Digital diary', BookOpen],
  ['Catalogue', Gem],
  ['Customers', Users],
  ['Reports', TrendingUp],
  ['Settings', Settings],
] as const

type NavLabel = (typeof nav)[number][0]

export function AppDashboard() {
  const [active, setActive] = useState<NavLabel>('Overview')
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [orderCount, setOrderCount] = useState(0)
  const [createRequest, setCreateRequest] = useState(0)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const noticeTimeout = useRef<number | null>(null)

  const notify = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimeout.current) window.clearTimeout(noticeTimeout.current)
    noticeTimeout.current = window.setTimeout(() => setNotice(''), 3200)
  }, [])

  const refreshOrders = useCallback(() => setRefreshKey((value) => value + 1), [])
  const clearOpenOrder = useCallback(() => setOpenOrderId(null), [])
  const handleReminderView = useCallback((id: string) => {
    setOpenOrderId(id)
    setActive('Digital diary')
  }, [])
  const allowReminderSound = useCallback(() => {
    void enableReminderSound()
      .then(() => setSoundEnabled(true))
      .catch((error: unknown) => {
        console.error('Reminder sound could not be enabled:', error)
        notify('This browser could not enable reminder sound.')
      })
  }, [notify])

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('order')
    if (orderId) {
      handleReminderView(orderId)
      window.history.replaceState(null, '', '/')
    }
  }, [handleReminderView])

  useEffect(() => () => {
    if (noticeTimeout.current) window.clearTimeout(noticeTimeout.current)
  }, [])

  function createOrder() {
    setActive('Digital diary')
    setCreateRequest((value) => value + 1)
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Gem size={18} /></div>
          <div><strong>Suvarna</strong><span>Goldsmith studio</span></div>
          <button className="mobile-close" onClick={() => setMenu(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {nav.slice(0, 4).map(([label, Icon]) => (
            <NavButton key={label} label={label} Icon={Icon} active={active} setActive={setActive} close={() => setMenu(false)} count={label === 'Digital diary' ? orderCount : undefined} />
          ))}
        </nav>
        <div className="nav-divider" />
        <div className="workspace-label">MANAGE</div>
        <nav className="nav-list">
          {nav.slice(4).map(([label, Icon]) => <NavButton key={label} label={label} Icon={Icon} active={active} setActive={setActive} close={() => setMenu(false)} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><div><strong>Need help?</strong><span>View the quick guide</span></div><ChevronRight size={15} /></div>
          <div className="profile">
            <div className="avatar">RK</div>
            <div><strong>Rajesh Kumar</strong><span>Administrator</span></div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{active}</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Open delivery diary" onClick={() => setActive('Digital diary')}><Bell size={19} /><i /></button>
            <div className="top-avatar">RK</div>
          </div>
        </header>

        {active === 'Overview' ? (
          <Overview setActive={setActive} onCreateOrder={createOrder} refreshKey={refreshKey} onCountsChange={setOrderCount} />
        ) : active === 'Digital diary' ? (
          <DigitalDiary
            createRequest={createRequest}
            refreshKey={refreshKey}
            openOrderId={openOrderId}
            onCreateHandled={() => setCreateRequest(0)}
            onOpenOrderHandled={clearOpenOrder}
            onOrdersChanged={refreshOrders}
            notify={notify}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
          />
        ) : (
          <SectionPage active={active} notify={notify} />
        )}
      </section>

      <ReminderCenter onViewOrder={handleReminderView} onOrdersChanged={refreshOrders} notify={notify} soundEnabled={soundEnabled} onEnableSound={allowReminderSound} />
      {notice && <div className="toast"><PackageCheck size={17} />{notice}</div>}
    </main>
  )
}

function NavButton({
  label,
  Icon,
  active,
  setActive,
  close,
  count,
}: {
  label: NavLabel
  Icon: React.ElementType
  active: string
  setActive: (value: NavLabel) => void
  close: () => void
  count?: number
}) {
  return (
    <button className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => { setActive(label); close() }}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
      {count !== undefined && <em>{count}</em>}
    </button>
  )
}

function Overview({
  setActive,
  onCreateOrder,
  refreshKey,
  onCountsChange,
}: {
  setActive: (value: NavLabel) => void
  onCreateOrder: () => void
  refreshKey: number
  onCountsChange: (count: number) => void
}) {
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetch('/api/orders', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign('/login')
          throw new Error('Your session has expired.')
        }
        const result = (await response.json()) as { orders?: OrderRecord[]; error?: string }
        if (!response.ok) throw new Error(result.error ?? 'Orders could not be loaded.')
        if (!cancelled) {
          const loaded = result.orders ?? []
          setOrders(loaded)
          onCountsChange(loaded.filter((order) => order.status !== 'completed').length)
          setLoadError('')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Orders could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshKey, onCountsChange])

  const pendingCount = orders.filter((order) => order.status === 'pending').length
  const overdueCount = orders.filter((order) => order.status === 'overdue').length
  const customerCount = new Set(orders.map((order) => order.customerName.toLocaleLowerCase())).size
  const advanceTotal = orders.reduce((total, order) => total + order.advanceAmount, 0)
  const activeCount = pendingCount + overdueCount
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
  const latestOrders = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)

  return (
    <div className="content-wrap">
      <div className="page-heading">
        <div><p className="eyebrow">{today} · INDIA STANDARD TIME</p><h1>Good morning, Rajesh<span>.</span></h1><p className="subheading">Here&apos;s what&apos;s happening in your workshop today.</p></div>
        <button className="primary-button" onClick={onCreateOrder}><Plus size={18} /> New order</button>
      </div>
      <div className="stats-grid">
        <Stat icon={<BookOpen size={18} />} label="Active orders" value={String(activeCount)} detail="Pending and overdue" />
        <Stat icon={<Users size={18} />} label="Customers" value={String(customerCount)} detail="From saved orders" />
        <Stat icon={<PackageCheck size={18} />} label="Overdue orders" value={String(overdueCount)} detail="Past their deadline" />
        <Stat icon={<ShoppingBag size={18} />} label="Advances received" value={formatAmount(advanceTotal)} detail="Across saved orders" />
      </div>
      <div className="section-grid">
        <section className="panel orders-panel">
          <PanelTitle title="Recent orders" subtitle="Latest saved workshop orders" action="View all" onClick={() => setActive('Digital diary')} />
          {loadError ? <div className="empty-state" role="alert">{loadError}</div> : loading ? <div className="empty-state">Loading orders…</div> : latestOrders.length === 0 ? (
            <div className="empty-state">Your saved orders will appear here.<br /><button className="text-button overview-add" onClick={onCreateOrder}><Plus size={14} /> Add your first order</button></div>
          ) : (
            <div className="orders-table">
              <div className="table-row table-header"><span>Customer</span><span>Jewellery</span><span>Advance</span><span>Delivery</span><span>Status</span></div>
              {latestOrders.map((order) => (
                <div className="table-row" key={order.id}>
                  <span className="customer-cell"><span className="mini-avatar">{initials(order.customerName)}</span>{order.customerName}</span>
                  <span>{order.jewelleryName}</span>
                  <span>{formatAmount(order.advanceAmount)}</span>
                  <span>{formatDate(order.deliveryDeadline)}</span>
                  <span><Status status={order.status}>{order.status}</Status></span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel diary-card">
          <PanelTitle title="Digital diary" subtitle="Your workshop at a glance" action="Open" onClick={() => setActive('Digital diary')} />
          <div className="diary-hero">
            <div className="diary-ring"><strong>{orders.length ? Math.round((pendingCount / orders.length) * 100) : 0}<span>%</span></strong><small>on track</small></div>
            <div><strong>{activeCount ? `${activeCount} active orders` : 'A clear workshop day'}</strong><p>{overdueCount ? `${overdueCount} ${overdueCount === 1 ? 'order needs' : 'orders need'} attention.` : 'Your order schedule is up to date.'}</p></div>
          </div>
          <div className="progress-line"><span style={{ width: `${orders.length ? Math.round((pendingCount / orders.length) * 100) : 0}%` }} /></div>
          <div className="diary-list">
            <div><span className="dot dot-gold" />Pending<strong>{pendingCount}</strong></div>
            <div><span className="dot dot-blue" />Overdue<strong>{overdueCount}</strong></div>
            <div><span className="dot dot-green" />Completed<strong>{orders.filter((order) => order.status === 'completed').length}</strong></div>
          </div>
        </section>
      </div>
      <section className="catalogue-section">
        <PanelTitle title="Featured catalogue" subtitle="Popular designs customers are browsing" action="Browse catalogue" onClick={() => setActive('Catalogue')} />
        <div className="design-grid">{designs.map(([id, name, category, image]) => (
          <article className="design-card" key={id}>
            <div className="design-image"><img src={image} alt={name} /><span>Featured</span><button aria-label={`View ${name}`}><ChevronRight size={17} /></button></div>
            <div className="design-info"><div><strong>{name}</strong><span>{id} · {category}</span></div><Sparkles size={17} /></div>
          </article>
        ))}</div>
      </section>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`))
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function SectionPage({ active, notify }: { active: Exclude<NavLabel, 'Overview' | 'Digital diary'>; notify: (text: string) => void }) {
  const copy: Record<Exclude<NavLabel, 'Overview' | 'Digital diary'>, [string, string, string]> = {
    Catalogue: ['Catalogue', 'Your jewellery designs, organised for easy browsing.', 'Add design'],
    Customers: ['Customers', 'Keep customer details and relationships close at hand.', 'Add customer'],
    Reports: ['Reports', 'Understand workshop activity and business performance.', 'Export report'],
    Settings: ['Settings', 'Manage your workspace preferences and account.', 'Save changes'],
  }
  const [title, subtitle, action] = copy[active]
  const [catalogueDesigns, setCatalogueDesigns] = useState(designs)
  const uploadDesign = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const image = URL.createObjectURL(file)
    setCatalogueDesigns((current) => [[`GD-${104 + current.length + 1}`, file.name.replace(/\.[^/.]+$/, ''), 'New design', image], ...current])
    notify('Design added to your catalogue')
    event.target.value = ''
  }
  const deleteDesign = (id: string, name: string) => {
    setCatalogueDesigns((current) => current.filter(([designId]) => designId !== id))
    notify(`${name} removed from your catalogue`)
  }
  return (
    <div className="content-wrap">
      <div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>{title}</h1><p className="subheading">{subtitle}</p></div>
        {active === 'Catalogue' ? <label className="primary-button upload-button"><Plus size={18} /> {action}<input type="file" accept="image/*" onChange={uploadDesign} /></label> : <button className="primary-button" onClick={() => notify(`${action} is ready`)}><Plus size={18} /> {action}</button>}
      </div>
      {active === 'Catalogue' ? (
        <div className="catalogue-grid">{catalogueDesigns.map(([id, name, category, image]) => (
          <article className="design-card" key={id}><img src={image} alt={name} /><div className="design-card-body"><div className="design-card-meta"><span>{category}</span><button className="delete-design" onClick={() => deleteDesign(id, name)} aria-label={`Delete ${name}`} title="Delete design"><Trash2 size={15} /></button></div><h2>{name}</h2><small>{id}</small></div></article>
        ))}</div>
      ) : (
        <div className="panel section-empty"><div className="empty-icon">{active === 'Customers' ? <Users /> : active === 'Reports' ? <TrendingUp /> : <Settings />}</div><h2>{title}</h2><p>This is your dedicated {title.toLowerCase()} page. Everything here is separated from the overview so your workspace stays focused.</p><button className="secondary-button" onClick={() => notify(`${title} updated`)}>Get started <ChevronRight size={16} /></button></div>
      )}
    </div>
  )
}

function PanelTitle({ title, subtitle, action, onClick }: { title: string; subtitle: string; action: string; onClick: () => void }) {
  return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="text-button" onClick={onClick}>{action} <ChevronRight size={15} /></button></div>
}

function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="stat-card"><div className="stat-icon gold">{icon}</div><p>{label}</p><div className="stat-value">{value}</div><div className="stat-change">{detail}</div></div>
}

function Status({ status, children }: { status: OrderStatus; children: React.ReactNode }) {
  const color = status === 'completed' ? 'green' : status === 'overdue' ? 'violet' : 'amber'
  return <span className={`status ${color}`}><i />{children}</span>
}
