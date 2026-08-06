// Crania Store — v1 ported from the client's v20 mockup.
// Retail-side inventory: same shape as /api/stock plus per-item
// tax %, auto-computed store price, and base64 item image.
// State persists at GET/PUT /api/crania-store.
//
// Auto-price formula (from mockup): price = ceil(cost*(1+tax/100)) * 10
// e.g. cost 0.15 / tax 13 → 0.1695 → ceil($1) → $10 store price.
//
// v1 scope: metrics tiles (adds Shelf Value = qty × price), filters
// (search + category + sub + status), full table with tax + price +
// image thumbnails, add/edit/delete via modal (paste/upload image),
// quick +/- qty adjust (logged), separate Log view.
//
// v1 skipped (round-trips as data, no UI yet): undo/redo, CSV export,
// bulk edit/delete, category/sub-cat colour swatches manager,
// drag-reorder, backups, per-item colour overrides.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, Edit2, Trash2, Search } from 'lucide-react'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'
import useHistory from '../data/useHistory'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const DEFAULT_COL_ORDER = ['num', 'name', 'category', 'sub', 'sku', 'img', 'qty', 'reorder', 'cost', 'tax', 'price', 'value', 'location', 'status']

const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const money = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return ''
  return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) +
    ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Sub-color keys use the same U+241F separator as Inventory to match
// the JSON exports.
const SUB_SEP = '␟'
const subKey = (cat, sub) => `${cat || ''}${SUB_SEP}${sub || ''}`

function textOn(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return '#2E2516'
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 >= 155 ? '#2E2516' : '#ffffff'
}
function statusOf(item) {
  const q = Number(item.qty) || 0
  const r = Number(item.reorder) || 0
  if (q <= 0) return 'out'
  if (q <= r) return 'low'
  return 'ok'
}
// Auto-computed retail price: cost including tax, rounded up to
// the nearest whole dollar, then multiplied by 10. Matches the
// mockup's readonly formula.
function calcPrice(cost, tax) {
  const c = Number(cost) || 0
  const t = Number(tax) || 0
  if (c <= 0) return 0
  return Math.ceil(c * (1 + t / 100)) * 10
}

// ---------- Image resizer ----------
// Shrink dropped/pasted image to a small thumbnail (data URL). Keeps
// the payload manageable at the DB level.
async function shrinkImage(file, maxSide = 320) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(''); return }
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // JPEG for smaller size on photos; PNG-transparent kept via source-format check.
        const isPngWithAlpha = /^data:image\/png/.test(fr.result)
        resolve(canvas.toDataURL(isPngWithAlpha ? 'image/png' : 'image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = fr.result
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

// ---------- store hook ----------
function useCraniaStore() {
  const [data, setData] = useState({
    items: [], log: [], categoryOrder: [], categoryColors: {},
    extraSubs: [], subOrder: {}, subColors: {}, colOrder: DEFAULT_COL_ORDER,
  })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(data); latest.current = data

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/crania-store`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setData({
        items:          Array.isArray(j.items) ? j.items : [],
        log:            Array.isArray(j.log)   ? j.log   : [],
        categoryOrder:  Array.isArray(j.categoryOrder) ? j.categoryOrder : [],
        categoryColors: j.categoryColors || {},
        extraSubs:      Array.isArray(j.extraSubs) ? j.extraSubs : [],
        subOrder:       j.subOrder || {},
        subColors:      j.subColors || {},
        colOrder:       Array.isArray(j.colOrder) && j.colOrder.length ? j.colOrder : DEFAULT_COL_ORDER,
      })
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const mutate = useCallback((mut) => {
    setData(prev => {
      const next = {
        ...prev,
        items: [...prev.items], log: [...prev.log],
        categoryOrder: [...prev.categoryOrder], categoryColors: { ...prev.categoryColors },
        extraSubs: [...prev.extraSubs], subOrder: { ...prev.subOrder },
        subColors: { ...prev.subColors }, colOrder: [...prev.colOrder],
      }
      mut(next)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/crania-store`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify(latest.current),
        }).catch(() => {})
      }, 400)
      return next
    })
  }, [])

  return { data, loading, status, mutate, refresh }
}

// ---------- Crania Store page ----------
export default function CraniaStore() {
  const { data, loading, status, mutate, refresh } = useCraniaStore()
  const [view, setView]        = useState('inventory') // 'inventory' | 'log'
  const [query, setQuery]      = useState('')
  const [catFilter, setCatFilter]     = useState('all')
  const [subFilter, setSubFilter]     = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing]  = useState(null)

  const categories = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const c of data.categoryOrder) if (c && !seen.has(c)) { out.push(c); seen.add(c) }
    for (const it of data.items) if (it.category && !seen.has(it.category)) { out.push(it.category); seen.add(it.category) }
    return out
  }, [data.categoryOrder, data.items])

  const subsInCurrentCat = useMemo(() => {
    if (catFilter === 'all') return []
    const seen = new Set()
    const out = []
    for (const it of data.items) if (it.category === catFilter && it.sub && !seen.has(it.sub)) { out.push(it.sub); seen.add(it.sub) }
    for (const s of data.extraSubs) if (s.cat === catFilter && s.name && !seen.has(s.name)) { out.push(s.name); seen.add(s.name) }
    return out
  }, [catFilter, data.items, data.extraSubs])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.items.filter(it => {
      if (catFilter !== 'all' && it.category !== catFilter) return false
      if (subFilter !== 'all' && it.sub !== subFilter) return false
      if (statusFilter !== 'all' && statusOf(it) !== statusFilter) return false
      if (!q) return true
      const hay = [it.num, it.name, it.category, it.sub, it.sku, it.location, it.notes]
        .map(v => String(v || '').toLowerCase()).join(' ')
      return hay.includes(q)
    }).sort((a, b) => {
      const na = (a.num || '').toString(), nb = (b.num || '').toString()
      if (na && nb && na !== nb) return na.localeCompare(nb, undefined, { numeric: true })
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [data.items, query, catFilter, subFilter, statusFilter])

  const metrics = useMemo(() => {
    let items = 0, units = 0, low = 0, out = 0, stockValue = 0, shelfValue = 0
    for (const it of data.items) {
      items += 1
      const q = Number(it.qty) || 0
      const c = Number(it.cost) || 0
      const t = Number(it.tax) || 0
      const p = Number(it.price) || calcPrice(it.cost, it.tax)
      units += q
      stockValue += q * c * (1 + t / 100)
      shelfValue += q * p
      const s = statusOf(it)
      if (s === 'low') low += 1
      if (s === 'out') out += 1
    }
    return { items, units, low, out, stockValue, shelfValue }
  }, [data.items])

  // ---- item mutations ----
  const saveItem = (form) => {
    mutate(d => {
      const finalPrice = calcPrice(form.cost, form.tax)
      if (editing.mode === 'new') {
        const newItem = { id: uid(), ...form, price: finalPrice }
        d.items.push(newItem)
        d.log.push({
          id: uid(), ts: new Date().toISOString(),
          itemId: newItem.id, itemName: newItem.name,
          delta: 0, after: Number(newItem.qty) || 0,
          user: '', note: 'item created',
        })
      } else {
        const i = d.items.findIndex(x => x.id === editing.item.id)
        if (i !== -1) {
          const prevQty = Number(d.items[i].qty) || 0
          const newQty  = Number(form.qty) || 0
          d.items[i] = { ...d.items[i], ...form, price: finalPrice }
          if (newQty !== prevQty) {
            d.log.push({
              id: uid(), ts: new Date().toISOString(),
              itemId: editing.item.id, itemName: form.name || d.items[i].name,
              delta: newQty - prevQty, after: newQty,
              user: '', note: 'edited via form',
            })
          }
        }
      }
    })
    setEditing(null)
  }
  const deleteItem = (id) => {
    const it = data.items.find(x => x.id === id)
    if (!confirm(`Delete "${it?.name || 'this item'}"?`)) return
    mutate(d => {
      d.items = d.items.filter(x => x.id !== id)
      d.log.push({
        id: uid(), ts: new Date().toISOString(),
        itemId: id, itemName: it?.name || '',
        delta: 0, after: 0, user: '', note: 'item deleted',
      })
    })
  }
  const bumpQty = (id, delta) => {
    mutate(d => {
      const i = d.items.findIndex(x => x.id === id)
      if (i === -1) return
      const newQty = Math.max(0, (Number(d.items[i].qty) || 0) + delta)
      d.items[i] = { ...d.items[i], qty: newQty }
      d.log.push({
        id: uid(), ts: new Date().toISOString(),
        itemId: id, itemName: d.items[i].name,
        delta, after: newQty, user: '',
        note: delta > 0 ? 'quick +1' : 'quick −1',
      })
    })
  }

  // Undo/redo over the page's own data — see src/data/useHistory.js
  const hist = useHistory(data, next => mutate(() => next), { label: 'store change' })

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }


  return (
    <div className="page">

      <style>{PAGEACTIONS_CSS}</style>
      {view === 'inventory' ? (
        <PageActions
        {...hist}
          csvName="crania-store-inventory"
          csvColumns={[
            { key: 'num', label: 'Item #' },
            { key: 'name', label: 'Name' },
            { key: 'category', label: 'Category' },
            { key: 'sub', label: 'Sub-Category' },
            { key: 'sku', label: 'SKU' },
            { key: 'qty', label: 'On Hand' },
            { key: 'reorder', label: 'Reorder Level' },
            { key: 'cost', label: 'Cost' },
            { key: 'tax', label: 'Tax %' },
            { key: 'price', label: 'Store Price' },
            { key: 'shelfValue', label: 'Shelf Value' },
            { key: 'location', label: 'Location' },
            { key: 'status', label: 'Status' },
            { key: 'notes', label: 'Notes' },
          ]}
          csvRows={() => filteredItems.map(it => {
            const price = Number(it.price) || calcPrice(it.cost, it.tax)
            const s = statusOf(it)
            return {
              num: it.num || '',
              name: it.name || '',
              category: it.category || '',
              sub: it.sub || '',
              sku: it.sku || '',
              qty: Number(it.qty) || 0,
              reorder: Number(it.reorder) || 0,
              cost: Number(it.cost) || 0,
              tax: Number(it.tax) || 0,
              price,
              shelfValue: (Number(it.qty) || 0) * price,
              location: it.location || '',
              status: s === 'ok' ? 'In Stock' : s === 'low' ? 'Low Stock' : 'Out of Stock',
              notes: it.notes || '',
            }
          })}
          backupCollection="craniaStore"
          backupHint="Snapshots of every store item and its stock-change log (last 14 kept)."
          onRestored={refresh}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setView(v => v === 'log' ? 'inventory' : 'log')}
              style={{
                background: '#fff', border: '1px solid #e2ded2', color: 'var(--brand-dark-brown)',
                padding: '6px 12px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
              }}
            >
              {view === 'log' ? '← Back to Store' : '📓 Log'}
            </button>
          </div>
          <button onClick={() => setEditing({ mode: 'new', item: null })} title="Add a store item">
            <Plus size={13} /> Add Item
          </button>
        </PageActions>
      ) : (
        <PageActions
          csvName="crania-store-log"
          csvColumns={[
            { key: 'ts', label: 'When' },
            { key: 'itemName', label: 'Item' },
            { key: 'delta', label: 'Change' },
            { key: 'after', label: 'On Hand After' },
            { key: 'user', label: 'Who' },
            { key: 'note', label: 'Reason' },
          ]}
          csvRows={() => [...data.log]
            .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
            .map(row => ({
              ts: row.ts || '',
              itemName: row.itemName || '',
              delta: Number(row.delta) || 0,
              after: row.after ?? 0,
              user: row.user || '',
              note: row.note || '',
            }))}
          backupCollection="craniaStore"
          backupHint="Snapshots of every store item and its stock-change log (last 14 kept)."
          onRestored={refresh}
        />
      )}

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      {view === 'inventory' ? (
        <>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            <MetricTile label="Items"        value={metrics.items} hint={`${metrics.units} units on hand`} />
            <MetricTile label="Low Stock"    value={metrics.low}   hint="at or below reorder level"
              color={metrics.low > 0 ? '#8a6a00' : 'var(--ink)'}
              onClick={() => { setStatusFilter('low');  setSubFilter('all'); setCatFilter('all') }} />
            <MetricTile label="Out of Stock" value={metrics.out}   hint="needs reordering"
              color={metrics.out > 0 ? '#a12626' : 'var(--ink)'}
              onClick={() => { setStatusFilter('out');  setSubFilter('all'); setCatFilter('all') }} />
            <MetricTile label="Stock Value"  value={money(metrics.stockValue)} hint="on hand × cost + tax" />
            <MetricTile label="Shelf Value"  value={money(metrics.shelfValue)} hint="on hand × store price" />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search any column…"
                style={{ width: '100%', padding: '7px 8px 7px 30px', fontSize: 13,
                         border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }} />
            </div>
            <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setSubFilter('all') }}
              style={selStyle}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={subFilter} onChange={e => setSubFilter(e.target.value)} style={selStyle}
              disabled={catFilter === 'all'}>
              <option value="all">All Sub-Categories</option>
              {subsInCurrentCat.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle}>
              <option value="all">All Statuses</option>
              <option value="ok">In Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
            {(query || catFilter !== 'all' || subFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => { setQuery(''); setCatFilter('all'); setSubFilter('all'); setStatusFilter('all') }}
                style={{ background: 'transparent', border: 'none', color: 'var(--brand-dark-blue)',
                         textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
              >Clear</button>
            )}
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto',
                        boxShadow: '0 1px 3px rgba(46,37,22,.15)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
                  <Th>Item #</Th><Th>Name</Th><Th>Category</Th><Th>Sub-Category</Th>
                  <Th align="center">Image</Th>
                  <Th align="right">On Hand</Th><Th align="right">Reorder</Th>
                  <Th align="right">Cost</Th><Th align="right">Tax %</Th><Th align="right">Store Price</Th>
                  <Th align="right">Shelf Value</Th>
                  <Th>Location</Th><Th align="center">Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr><td colSpan={14} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                    {data.items.length === 0
                      ? 'No items yet — click + Add Item to start stocking the store.'
                      : 'No items match your filters.'}
                  </td></tr>
                )}
                {filteredItems.map((it, i) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    stripe={i % 2}
                    catColor={data.categoryColors[it.category]}
                    subColor={data.subColors[subKey(it.category, it.sub)]}
                    onEdit={() => setEditing({ mode: 'edit', item: it })}
                    onDelete={() => deleteItem(it.id)}
                    onBump={(delta) => bumpQty(it.id, delta)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <LogView log={data.log} />
      )}

      {editing && (
        <ItemModal
          mode={editing.mode}
          initial={editing.item}
          categories={categories}
          extraSubs={data.extraSubs}
          items={data.items}
          onClose={() => setEditing(null)}
          onSave={saveItem}
          onDelete={editing.mode === 'edit' ? () => { deleteItem(editing.item.id); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

// ---------- Small components ----------
const selStyle = {
  padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4',
  borderRadius: 8, background: '#fff', color: 'var(--brand-dark-brown)',
}
function Th({ children, align = 'left' }) {
  return <th style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
    padding: '10px 12px', textAlign: align, whiteSpace: 'nowrap',
  }}>{children}</th>
}
function MetricTile({ label, value, hint, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
      padding: '12px 16px', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

// ---------- Row ----------
function ItemRow({ item, stripe, catColor, subColor, onEdit, onDelete, onBump }) {
  const s = statusOf(item)
  const price = Number(item.price) || calcPrice(item.cost, item.tax)
  const shelf = (Number(item.qty) || 0) * price
  const bg = stripe ? '#fafaf7' : '#fff'
  return (
    <tr style={{ background: bg, borderTop: '1px solid #f0ede3' }}>
      <Td mono>{item.num}</Td>
      <Td strong onClick={onEdit} style={{ cursor: 'pointer' }}>{item.name}</Td>
      <Td>
        <span style={{ background: catColor || '#eee', color: textOn(catColor || '#eee'),
                       borderRadius: 5, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
          {item.category || '—'}
        </span>
      </Td>
      <Td>
        {item.sub ? (
          <span style={{ background: subColor || '#f4f2ea', color: textOn(subColor || '#f4f2ea'),
                         borderRadius: 5, padding: '2px 8px', fontSize: 12 }}>{item.sub}</span>
        ) : <span style={{ color: 'var(--muted)' }}>—</span>}
      </Td>
      <Td align="center">
        {item.img ? (
          <img src={item.img} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4,
                                              border: '1px solid #eee', verticalAlign: 'middle' }} />
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
        )}
      </Td>
      <Td align="right">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          <button onClick={() => onBump(-1)} style={btnMini} title="−1"><Minus size={12} /></button>
          <span style={{
            display: 'inline-block', minWidth: 30, textAlign: 'center', fontWeight: 700,
            color: s === 'out' ? '#a12626' : s === 'low' ? '#8a6a00' : 'inherit',
          }}>{item.qty || 0}</span>
          <button onClick={() => onBump(+1)} style={btnMini} title="+1"><Plus size={12} /></button>
        </div>
      </Td>
      <Td align="right" muted>{item.reorder || 0}</Td>
      <Td align="right" muted>{money(item.cost)}</Td>
      <Td align="right" muted>{Number(item.tax) || 0}%</Td>
      <Td align="right" strong>{money(price)}</Td>
      <Td align="right" strong>{money(shelf)}</Td>
      <Td muted>{item.location || '—'}</Td>
      <Td align="center"><StatusPill status={s} /></Td>
      <Td align="center">
        <button onClick={onEdit} title="Edit" style={iconBtn}><Edit2 size={13} /></button>
        <button onClick={onDelete} title="Delete" style={iconBtn}><Trash2 size={13} /></button>
      </Td>
    </tr>
  )
}
function Td({ children, align = 'left', mono, strong, muted, onClick, style }) {
  return (
    <td onClick={onClick} style={{
      padding: '9px 12px', textAlign: align, verticalAlign: 'middle',
      fontFamily: mono ? 'Consolas, Menlo, monospace' : undefined,
      fontWeight: strong ? 600 : 400, color: muted ? 'var(--ink-soft)' : 'inherit',
      whiteSpace: 'nowrap', ...style,
    }}>{children}</td>
  )
}
const btnMini = {
  width: 20, height: 20, borderRadius: 4, border: '1px solid #d5d0c4',
  background: '#fff', color: 'var(--brand-dark-brown)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const iconBtn = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--ink-soft)', padding: '4px 6px',
}
function StatusPill({ status }) {
  const map = {
    ok:  { label: 'In Stock',     bg: '#dff5e0', fg: '#2b7a2e' },
    low: { label: 'Low Stock',    bg: '#fff4d6', fg: '#8a6a00' },
    out: { label: 'Out of Stock', bg: '#fde0e0', fg: '#a12626' },
  }
  const s = map[status] || map.ok
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700,
    }}>{s.label}</span>
  )
}

// ---------- Item modal ----------
function ItemModal({ mode, initial, categories, extraSubs, items, onClose, onSave, onDelete }) {
  const [num,      setNum]      = useState(initial?.num || '')
  const [name,     setName]     = useState(initial?.name || '')
  const [category, setCategory] = useState(initial?.category || categories[0] || '')
  const [sub,      setSub]      = useState(initial?.sub || '')
  const [sku,      setSku]      = useState(initial?.sku || '')
  const [location, setLocation] = useState(initial?.location || '')
  const [qty,      setQty]      = useState(initial?.qty ?? 0)
  const [reorder,  setReorder]  = useState(initial?.reorder ?? 0)
  const [cost,     setCost]     = useState(initial?.cost ?? 0)
  const [tax,      setTax]      = useState(initial?.tax ?? 13)
  const [notes,    setNotes]    = useState(initial?.notes || '')
  const [img,      setImg]      = useState(initial?.img || '')
  const [dragOver, setDragOver] = useState(false)

  const [newCategory, setNewCategory] = useState('')
  const [newSub,      setNewSub]      = useState('')

  const catList = useMemo(() => Array.from(new Set([...categories, category].filter(Boolean))), [categories, category])
  const subsForCat = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const it of items) if (it.category === category && it.sub && !seen.has(it.sub)) { out.push(it.sub); seen.add(it.sub) }
    for (const s of extraSubs) if (s.cat === category && s.name && !seen.has(s.name)) { out.push(s.name); seen.add(s.name) }
    return out
  }, [items, extraSubs, category])

  const autoPrice = useMemo(() => calcPrice(cost, tax), [cost, tax])

  const handleImagePick = async (file) => {
    if (!file) return
    try {
      const shrunk = await shrinkImage(file, 320)
      setImg(shrunk)
    } catch (err) {
      alert('Could not process image: ' + (err?.message || err))
    }
  }
  // Paste-anywhere image capture: when the modal is open, listen on window.
  useEffect(() => {
    const onPaste = async (e) => {
      const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))
      if (!it) return
      const file = it.getAsFile()
      if (file) { e.preventDefault(); await handleImagePick(file) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const handleSave = () => {
    if (!name.trim()) { alert('Please enter an item name.'); return }
    const finalCat = newCategory.trim() || category
    const finalSub = newSub.trim() || sub
    if (!finalCat) { alert('Please choose or add a category.'); return }
    onSave({
      num: num.trim(),
      name: name.trim(),
      category: finalCat,
      sub: finalSub,
      sku: sku.trim(),
      location: location.trim(),
      qty: Math.max(0, Number(qty) || 0),
      reorder: Math.max(0, Number(reorder) || 0),
      cost: Math.max(0, Number(cost) || 0),
      tax: Math.max(0, Number(tax) || 0),
      notes: notes.trim(),
      img,
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Store Item' : 'New Store Item'}</h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: '0 0 110px' }}>
            <label>Item #</label>
            <input value={num} onChange={e => setNum(e.target.value)} placeholder="cat-sub-item" />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Item Name</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Category</label>
            <select value={category} onChange={e => { setCategory(e.target.value); setSub(''); setNewCategory('') }}>
              {catList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={newCategory} onChange={e => setNewCategory(e.target.value)}
              placeholder="Or type a new category…" style={{ marginTop: 6 }} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Sub-Category</label>
            <select value={sub} onChange={e => { setSub(e.target.value); setNewSub('') }}>
              <option value="">(none)</option>
              {subsForCat.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={newSub} onChange={e => setNewSub(e.target.value)}
              placeholder="Or type a new sub…" style={{ marginTop: 6 }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>SKU / Code</label>
            <input value={sku} onChange={e => setSku(e.target.value)} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>On Hand</label>
            <input type="number" min="0" step="1" value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Reorder Level</label>
            <input type="number" min="0" step="1" value={reorder} onChange={e => setReorder(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Actual Cost ($)</label>
            <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Tax (%)</label>
            <input type="number" min="0" step="0.01" value={tax} onChange={e => setTax(e.target.value)} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Store Price (auto)</label>
            <input value={money(autoPrice)} readOnly
              title="ceil(cost × (1+tax/100)) × 10"
              style={{ background: '#f4f2ea', color: '#6b6455', cursor: 'not-allowed' }} />
          </div>
        </div>

        <div className="kb-field">
          <label>Item Image (drop, paste, or click)</label>
          <div
            onClick={() => document.getElementById('storeImgFile').click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              const f = e.dataTransfer?.files?.[0]
              if (f) handleImagePick(f)
            }}
            style={{
              border: '2px dashed ' + (dragOver ? 'var(--brand-dark-blue)' : '#d5d0c4'),
              borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer',
              background: dragOver ? '#eefaff' : '#fafaf7', color: '#8a8474', fontSize: 13,
            }}
          >
            {img ? (
              <img src={img} alt="" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 4 }} />
            ) : (
              'Drop image here, paste, or click to choose'
            )}
          </div>
          <input id="storeImgFile" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleImagePick(e.target.files[0])} />
          {img && (
            <button onClick={() => setImg('')}
              style={{ marginTop: 6, background: 'transparent', border: 'none',
                       color: '#c0392b', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
              Remove Image
            </button>
          )}
        </div>

        <div className="kb-field">
          <label>Comments / Notes</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="kb-actions">
          {onDelete && <button className="del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Log view ----------
function LogView({ log }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...log]
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
      .filter(row => !q || [row.itemName, row.user, row.note].join(' ').toLowerCase().includes(q))
  }, [log, search])
  return (
    <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(46,37,22,.15)' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0ede3',
                    background: '#fffbef', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ flex: '0 0 auto', fontSize: 13 }}>
          Stock-Change Log — {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
        </strong>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search the log…"
            style={{ width: 250, padding: '7px 8px 7px 30px', fontSize: 13,
                     border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }} />
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
            <Th>When</Th><Th>Item</Th><Th align="center">Change</Th>
            <Th align="center">On Hand After</Th><Th>Who</Th><Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              No log entries.
            </td></tr>
          )}
          {filtered.map((row, i) => {
            const d = Number(row.delta) || 0
            return (
              <tr key={row.id} style={{ background: i % 2 ? '#fafaf7' : '#fff', borderTop: '1px solid #f0ede3' }}>
                <Td muted>{fmtDateTime(row.ts)}</Td>
                <Td strong>{row.itemName || '—'}</Td>
                <Td align="center" style={{
                  color: d > 0 ? '#2b7a2e' : d < 0 ? '#a12626' : 'var(--muted)',
                  fontWeight: 700,
                }}>{d > 0 ? '+' + d : d}</Td>
                <Td align="center">{row.after ?? 0}</Td>
                <Td muted>{row.user || '—'}</Td>
                <Td muted>{row.note || '—'}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
