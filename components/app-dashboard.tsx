'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Gem,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { DigitalDiary, enableReminderSound, ReminderCenter } from '@/components/digital-diary'
import { BillGenerator } from '@/components/bill-generator'
import { SavedBills } from '@/components/saved-bills'
import { MetalRates } from '@/components/metal-rates'
import { LanguageSwitch, useLanguage } from '@/lib/language'
import type { OrderRecord, OrderStatus } from '@/lib/order-types'

const designs = [
  ['GD-104', 'Lakshmi Haaram', 'Necklaces', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=85'],
  ['GD-087', 'Kundan Choker', 'Bridal', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=600&q=85'],
  ['GD-112', 'Mango Nakshi Bangle', 'Bangles', 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=600&q=85'],
] as const
type CatalogueDesign = [string, string, string, string]
const legacyCatalogueStorageKey = 'suvarna_catalogue_designs_v1'

function isCatalogueDesigns(value: unknown): value is CatalogueDesign[] {
  return Array.isArray(value) && value.every((design) =>
    Array.isArray(design) && design.length === 4 && design.every((field) => typeof field === 'string'),
  )
}
const nav = [
  ['Overview', LayoutDashboard],
  ['Orders', ClipboardList],
  ['Digital Diary', BookOpen],
  ['Catalogue', Gem],
  ['Reports', TrendingUp],
] as const

type NavLabel = (typeof nav)[number][0]

export function AppDashboard() {
  const { t } = useLanguage()
  const [active, setActive] = useState<NavLabel>('Overview')
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [orderCount, setOrderCount] = useState(0)
  const [createRequest, setCreateRequest] = useState(0)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [savedBillsRefreshKey, setSavedBillsRefreshKey] = useState(0)
  const [accountIdentifier, setAccountIdentifier] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [isLegacyWorkspace, setIsLegacyWorkspace] = useState(false)
  const [catalogueDesigns, setCatalogueDesigns] = useState<CatalogueDesign[]>(designs.map((design) => [...design]))
  const [catalogueReady, setCatalogueReady] = useState(false)
  const [catalogueLoadError, setCatalogueLoadError] = useState('')
  const noticeTimeout = useRef<number | null>(null)

  useEffect(() => {
    if (!menu) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menu])

  const notify = useCallback((text: string) => {
    setNotice(t(text))
    if (noticeTimeout.current) window.clearTimeout(noticeTimeout.current)
    noticeTimeout.current = window.setTimeout(() => setNotice(''), 3200)
  }, [t])

  const refreshOrders = useCallback(() => setRefreshKey((value) => value + 1), [])
  const clearOpenOrder = useCallback(() => setOpenOrderId(null), [])
  const handleReminderView = useCallback((id: string) => {
    setOpenOrderId(id)
    setActive('Orders')
  }, [])
  const allowReminderSound = useCallback(() => {
    void enableReminderSound()
      .then(() => setSoundEnabled(true))
      .catch((error: unknown) => {
        console.error('Reminder sound could not be enabled:', error)
        notify(t('This browser could not enable reminder sound.'))
      })
  }, [notify, t])

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

  useEffect(() => {
    let cancelled = false
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as {
          identifier?: string
          displayName?: string | null
          workspaceId?: string
          isLegacyWorkspace?: boolean
          error?: string
        }
        if (!response.ok) throw new Error(result.error ?? 'Account information is temporarily unavailable.')
        if (!cancelled && result.identifier) setAccountIdentifier(result.identifier)
        if (!cancelled && result.displayName) setDisplayName(result.displayName)
        if (!cancelled && result.workspaceId) setWorkspaceId(result.workspaceId)
        if (!cancelled && result.isLegacyWorkspace !== undefined) setIsLegacyWorkspace(result.isLegacyWorkspace)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('Could not load the signed-in account:', error)
          setAccountIdentifier(t('Account unavailable'))
        }
      })
    return () => { cancelled = true }
  }, [t])

  useEffect(() => {
    if (!workspaceId) {
      setCatalogueReady(false)
      return
    }
    const catalogueStorageKey = `suvarna_catalogue_designs_${workspaceId}`
    try {
      let saved = window.localStorage.getItem(catalogueStorageKey)
      if (saved === null && isLegacyWorkspace) {
        const legacySaved = window.localStorage.getItem(legacyCatalogueStorageKey)
        if (legacySaved !== null) {
          saved = legacySaved
          window.localStorage.setItem(catalogueStorageKey, legacySaved)
          window.localStorage.removeItem(legacyCatalogueStorageKey)
        }
      }
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved)
        if (!isCatalogueDesigns(parsed)) throw new Error('Saved catalogue data has an invalid format.')
        setCatalogueDesigns(parsed)
      }
      setCatalogueLoadError('')
    } catch (error) {
      console.error('Could not load saved catalogue designs:', error)
      setCatalogueLoadError(t('Catalogue could not be loaded.'))
    } finally {
      setCatalogueReady(true)
    }
  }, [isLegacyWorkspace, t, workspaceId])

  const saveCatalogueDesigns = useCallback((next: CatalogueDesign[]) => {
    if (!workspaceId) {
      notify(t('Workspace could not be loaded.'))
      return false
    }
    try {
      window.localStorage.setItem(`suvarna_catalogue_designs_${workspaceId}`, JSON.stringify(next))
      setCatalogueDesigns(next)
      setCatalogueLoadError('')
      return true
    } catch (error) {
      console.error('Could not save catalogue designs:', error)
      notify(t('Catalogue changes could not be saved.'))
      return false
    }
  }, [notify, t, workspaceId])

  function createOrder() {
    setActive('Orders')
    setCreateRequest((value) => value + 1)
  }

  async function signOut() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Sign-out failed.')
      window.location.assign('/login')
    } catch (error) {
      console.error('Could not sign out:', error)
      notify(t('Sign-out failed. Please try again.'))
    }
  }

  return (
    <main className="app-shell">
      {menu && <button className="sidebar-backdrop" aria-label={t('Close menu')} onClick={() => setMenu(false)} />}
      <aside id="workspace-navigation" className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Gem size={18} /></div>
          <div><strong>Kanthimathi</strong><span>{t('Goldsmith studio')}</span></div>
          <button className="mobile-close" onClick={() => setMenu(false)} aria-label={t('Close menu')}><X size={18} /></button>
        </div>
        <div className="workspace-label">{t('WORKSPACE')}</div>
        <nav className="nav-list" aria-label={t('Main navigation')}>
          {nav.slice(0, 4).map(([label, Icon]) => (
            <NavButton key={label} label={label} Icon={Icon} active={active} setActive={setActive} close={() => setMenu(false)} count={label === 'Orders' ? orderCount : undefined} />
          ))}
        </nav>
        <div className="nav-divider" />
        <div className="workspace-label">{t('MANAGE')}</div>
        <nav className="nav-list">
          {nav.slice(4).map(([label, Icon]) => <NavButton key={label} label={label} Icon={Icon} active={active} setActive={setActive} close={() => setMenu(false)} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{accountIdentifier.slice(0, 1).toUpperCase() || 'K'}</div>
            <div className="profile-details"><strong>{accountIdentifier || t('Loading account…')}</strong><span>{t('Workspace account')}</span></div>
          </div>
          <button className="sign-out-button" onClick={() => void signOut()}><LogOut size={15} />{t('Sign out')}</button>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenu(true)} aria-label={t('Open menu')} aria-expanded={menu} aria-controls="workspace-navigation"><Menu size={21} /></button>
          <div className="breadcrumb"><span>{t('Workspace')}</span><ChevronRight size={14} /><strong>{t(active)}</strong></div>
          <div className="top-actions">
            <LanguageSwitch />
            <button className="icon-button" aria-label={t('Open delivery orders')} onClick={() => setActive('Orders')}><Bell size={19} /><i /></button>
            <div className="top-avatar">{accountIdentifier.slice(0, 1).toUpperCase() || 'K'}</div>
          </div>
        </header>

        <MetalRates />

        {active === 'Overview' ? (
          <Overview setActive={setActive} onCreateOrder={createOrder} refreshKey={refreshKey} onCountsChange={setOrderCount} catalogueDesigns={catalogueReady ? catalogueDesigns : []} displayName={displayName} />
        ) : active === 'Orders' ? (
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
        ) : active === 'Digital Diary' ? (
          <BillGenerator onSaved={() => setSavedBillsRefreshKey((value) => value + 1)} />
        ) : active === 'Reports' ? (
          <SavedBills refreshKey={savedBillsRefreshKey} />
        ) : (
          <SectionPage active={active} notify={notify} catalogueDesigns={catalogueDesigns} catalogueReady={catalogueReady} catalogueLoadError={catalogueLoadError} saveCatalogueDesigns={saveCatalogueDesigns} />
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
  const { t } = useLanguage()
  return (
    <button className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => { setActive(label); close() }}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{t(label)}</span>
      {count !== undefined && <em>{count}</em>}
    </button>
  )
}

function Overview({
  setActive,
  onCreateOrder,
  refreshKey,
  onCountsChange,
  catalogueDesigns,
  displayName,
}: {
  setActive: (value: NavLabel) => void
  onCreateOrder: () => void
  refreshKey: number
  onCountsChange: (count: number) => void
  catalogueDesigns: CatalogueDesign[]
  displayName: string
}) {
  const { language, t } = useLanguage()
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
          throw new Error(t('Your session has expired.'))
        }
        const result = (await response.json()) as { orders?: OrderRecord[]; error?: string }
        if (!response.ok) throw new Error(t(result.error ?? 'Orders could not be loaded.'))
        if (!cancelled) {
          const loaded = result.orders ?? []
          setOrders(loaded)
          onCountsChange(loaded.filter((order) => order.status !== 'completed').length)
          setLoadError('')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(t(error instanceof Error ? error.message : 'Orders could not be loaded.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshKey, onCountsChange, t])

  const pendingCount = orders.filter((order) => order.status === 'pending').length
  const overdueCount = orders.filter((order) => order.status === 'overdue').length
  const customerCount = new Set(orders.map((order) => order.customerName.toLocaleLowerCase())).size
  const advanceTotal = orders.reduce((total, order) => total + order.advanceAmount, 0)
  const activeCount = pendingCount + overdueCount
  const today = new Intl.DateTimeFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
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
        <div><p className="eyebrow">{today} · {t('INDIA STANDARD TIME')}</p><h1>{t('Good morning')}{displayName ? `, ${displayName}` : ''}<span>.</span></h1><p className="subheading">{t("Here's what's happening in your workshop today.")}</p></div>
        <button className="primary-button" onClick={onCreateOrder}><Plus size={18} /> {t('New order')}</button>
      </div>
      <div className="stats-grid">
        <Stat icon={<BookOpen size={18} />} label={t('Active orders')} value={String(activeCount)} detail={t('Pending and overdue')} />
        <Stat icon={<Users size={18} />} label={t('Customers')} value={String(customerCount)} detail={t('From saved orders')} />
        <Stat icon={<PackageCheck size={18} />} label={t('Overdue orders')} value={String(overdueCount)} detail={t('Past their deadline')} />
        <Stat icon={<ShoppingBag size={18} />} label={t('Advances received')} value={formatAmount(advanceTotal, language)} detail={t('Across saved orders')} />
      </div>
      <div className="section-grid">
        <section className="panel orders-panel">
          <PanelTitle title={t('Recent orders')} subtitle={t('Latest saved workshop orders')} action={t('View all')} onClick={() => setActive('Orders')} />
          {loadError ? <div className="empty-state" role="alert">{loadError}</div> : loading ? <div className="empty-state">{t('Loading orders…')}</div> : latestOrders.length === 0 ? (
            <div className="empty-state">{t('Your saved orders will appear here.')}<br /><button className="text-button overview-add" onClick={onCreateOrder}><Plus size={14} /> {t('Add your first order')}</button></div>
          ) : (
            <div className="orders-table">
              <div className="table-row table-header"><span>{t('Customer')}</span><span>{t('Jewellery')}</span><span>{t('Advance')}</span><span>{t('Delivery')}</span><span>{t('Status')}</span></div>
              {latestOrders.map((order) => (
                <div className="table-row" key={order.id}>
                  <span className="customer-cell" data-label={t('Customer')}><span className="mini-avatar">{initials(order.customerName)}</span>{order.customerName}</span>
                  <span data-label={t('Jewellery')}>{order.jewelleryName}</span>
                  <span data-label={t('Advance')}>{formatAmount(order.advanceAmount, language)}</span>
                  <span data-label={t('Delivery')}>{formatDate(order.deliveryDeadline, language)}</span>
                  <span data-label={t('Status')}><Status status={order.status}>{t(order.status)}</Status></span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel diary-card">
          <PanelTitle title={t('Orders')} subtitle={t('Your workshop at a glance')} action={t('Open')} onClick={() => setActive('Orders')} />
          <div className="diary-hero">
            <div className="diary-ring"><strong>{orders.length ? Math.round((pendingCount / orders.length) * 100) : 0}<span>%</span></strong><small>{t('on track')}</small></div>
            <div><strong>{activeCount ? `${activeCount} ${t('active orders')}` : t('A clear workshop day')}</strong><p>{overdueCount ? `${overdueCount} ${t(overdueCount === 1 ? 'order needs' : 'orders need')} ${t('attention')}.` : t('Your order schedule is up to date.')}</p></div>
          </div>
          <div className="progress-line"><span style={{ width: `${orders.length ? Math.round((pendingCount / orders.length) * 100) : 0}%` }} /></div>
          <div className="diary-list">
            <div><span className="dot dot-gold" />{t('Pending')}<strong>{pendingCount}</strong></div>
            <div><span className="dot dot-blue" />{t('Overdue')}<strong>{overdueCount}</strong></div>
            <div><span className="dot dot-green" />{t('Completed')}<strong>{orders.filter((order) => order.status === 'completed').length}</strong></div>
          </div>
        </section>
      </div>
      <section className="catalogue-section">
        <PanelTitle title={t('Featured catalogue')} subtitle={t('Popular designs customers are browsing')} action={t('Browse catalogue')} onClick={() => setActive('Catalogue')} />
        <div className="design-grid">{catalogueDesigns.map(([id, name, category, image]) => (
          <article className="design-card" key={id}>
            <div className="design-image"><img src={image} alt={name} /><span>{t('Featured')}</span><button aria-label={`${t('View')} ${name}`}><ChevronRight size={17} /></button></div>
            <div className="design-info"><div><strong>{name}</strong><span>{id} · {t(category)}</span></div><Sparkles size={17} /></div>
          </article>
        ))}</div>
      </section>
    </div>
  )
}

function formatDate(value: string, language: 'en' | 'ta' = 'en') {
  return new Intl.DateTimeFormat(language === 'ta' ? 'ta-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`))
}

function formatAmount(value: number, language: 'en' | 'ta' = 'en') {
  return new Intl.NumberFormat(language === 'ta' ? 'ta-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function SectionPage({
  active,
  notify,
  catalogueDesigns,
  catalogueReady,
  catalogueLoadError,
  saveCatalogueDesigns,
}: {
  active: Exclude<NavLabel, 'Overview' | 'Orders' | 'Digital Diary'>
  notify: (text: string) => void
  catalogueDesigns: CatalogueDesign[]
  catalogueReady: boolean
  catalogueLoadError: string
  saveCatalogueDesigns: (designs: CatalogueDesign[]) => boolean
}) {
  const { t } = useLanguage()
  const copy: Record<Exclude<NavLabel, 'Overview' | 'Orders' | 'Digital Diary'>, [string, string, string]> = {
    Catalogue: [t('Catalogue'), t('Your jewellery designs, organised for easy browsing.'), t('Add design')],
    Reports: [t('Reports'), t('Understand workshop activity and business performance.'), t('Export report')],
  }
  const [title, subtitle, action] = copy[active]
  const uploadDesign = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    try {
      const image = await readImageAsDataUrl(file)
      const id = `GD-${Date.now()}`
      const next = [[id, file.name.replace(/\.[^/.]+$/, ''), 'New design', image] as CatalogueDesign, ...catalogueDesigns]
      if (saveCatalogueDesigns(next)) notify(t('Design added to your catalogue'))
    } catch (error) {
      console.error('Could not add catalogue design:', error)
      notify(t('Design could not be added to your catalogue.'))
    }
  }
  const deleteDesign = (id: string, name: string) => {
    const next = catalogueDesigns.filter(([designId]) => designId !== id)
    if (saveCatalogueDesigns(next)) notify(`${name} ${t('removed from your catalogue')}`)
  }
  return (
    <div className="content-wrap">
      <div className="page-heading"><div><p className="eyebrow">{t('WORKSPACE')}</p><h1>{title}</h1><p className="subheading">{subtitle}</p></div>
        {active === 'Catalogue' ? <label className="primary-button upload-button"><Plus size={18} /> {action}<input type="file" accept="image/*" onChange={uploadDesign} /></label> : <button className="primary-button" onClick={() => notify(`${action} ${t('is ready')}`)}><Plus size={18} /> {action}</button>}
      </div>
      {active === 'Catalogue' ? (
        catalogueLoadError ? <div className="empty-state" role="alert">{catalogueLoadError}</div> : !catalogueReady ? <div className="empty-state">{t('Loading catalogue…')}</div> : catalogueDesigns.length === 0 ? <div className="empty-state">{t('Your catalogue is empty.')}</div> : (
          <div className="catalogue-grid">{catalogueDesigns.map(([id, name, category, image]) => (
            <article className="design-card" key={id}><img src={image} alt={name} /><div className="design-card-body"><div className="design-card-meta"><span>{t(category)}</span><button className="delete-design" onClick={() => deleteDesign(id, name)} aria-label={`${t('Delete')} ${name}`} title={t('Delete design')}><Trash2 size={15} /></button></div><h2>{name}</h2><small>{id}</small></div></article>
          ))}</div>
        )
      ) : (
        <div className="panel section-empty"><div className="empty-icon"><TrendingUp /></div><h2>{title}</h2><p>{t('This is your dedicated')} {title.toLowerCase()} {t('page. Everything here is separated from the overview so your workspace stays focused.')}</p><button className="secondary-button" onClick={() => notify(`${title} ${t('updated')}`)}>{t('Get started')} <ChevronRight size={16} /></button></div>
      )}
    </div>
  )
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Image file could not be read.'))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Image file could not be read.')))
    reader.readAsDataURL(file)
  })
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
