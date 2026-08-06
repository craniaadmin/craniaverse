// Inventory — v1 ported from the client's v44 mockup.
// State persists at GET/PUT /api/stock (new singleton). Shape
// matches crania-inventory.json verbatim so exports round-trip.
//
// v1 scope: metrics tiles, search + category + sub + status filters,
// full table with all columns, add/edit/delete items via modal,
// quick +/- qty adjust (logged), separate Log view, category/sub
// colour tint on cells (seeded values used; not editable here yet).
//
// Skipped for v1 (round-trips as data, no UI yet): undo/redo, CSV
// export, bulk edit/delete, drag-reorder categories, backups,
// per-item colour swatches management.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, Edit2, Trash2, Search, X, Eye } from 'lucide-react'
import PageActions, { ColumnsMenu, RowCount } from '../components/PageActions'
import useHistory from '../data/useHistory'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const DEFAULT_COL_ORDER = ['num', 'name', 'category', 'sub', 'sku', 'qty', 'reorder', 'cost', 'value', 'location', 'status']
const COLUMN_LABELS = {
  num: 'Item #', name: 'Name', category: 'Category', sub: 'Sub-Category', sku: 'SKU',
  qty: 'On Hand', reorder: 'Reorder', cost: 'Unit Cost', value: 'Value',
  location: 'Location', status: 'Status',
}
const COL_ALIGN = { qty: 'right', reorder: 'right', cost: 'right', value: 'right', status: 'center' }

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

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

// Sub-color keys use a non-standard separator (U+241F in the JSON — "␟").
// We normalize both directions consistently.
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

// ---------- store hook ----------
function useStock() {
  const [data, setData] = useState({
    items: [], log: [], categoryOrder: [], categoryColors: {},
    extraSubs: [], subOrder: {}, subColors: {}, colOrder: DEFAULT_COL_ORDER,
    hiddenCols: {}, groupBy: false,
  })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(data); latest.current = data

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/stock`, { headers: HEADERS })
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
        hiddenCols:     j.hiddenCols || {},
        groupBy:        !!j.groupBy,
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
        hiddenCols: { ...prev.hiddenCols }, groupBy: prev.groupBy,
      }
      mut(next)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/stock`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify(latest.current),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [])

  return { data, loading, status, mutate, refresh }
}

// ---------- Inventory page ----------
export default function Inventory() {
  const { data, loading, status, mutate, refresh } = useStock()
  const [view, setView]          = useState('inventory') // 'inventory' | 'log'
  const [query, setQuery]        = useState('')
  const [catFilter, setCatFilter]     = useState('all')
  const [subFilter, setSubFilter]     = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing]    = useState(null) // null | {mode, item}

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
    for (const it of data.items) {
      if (it.category === catFilter && it.sub && !seen.has(it.sub)) { out.push(it.sub); seen.add(it.sub) }
    }
    for (const s of data.extraSubs) {
      if (s.cat === catFilter && s.name && !seen.has(s.name)) { out.push(s.name); seen.add(s.name) }
    }
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
      // Sort by num first (natural), then name.
      const na = (a.num || '').toString(), nb = (b.num || '').toString()
      if (na && nb && na !== nb) return na.localeCompare(nb, undefined, { numeric: true })
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [data.items, query, catFilter, subFilter, statusFilter])

  const metrics = useMemo(() => {
    let items = 0, units = 0, low = 0, out = 0, value = 0
    for (const it of data.items) {
      items += 1
      const q = Number(it.qty) || 0
      const c = Number(it.cost) || 0
      units += q
      value += q * c
      const s = statusOf(it)
      if (s === 'low') low += 1
      if (s === 'out') out += 1
    }
    return { items, units, low, out, value }
  }, [data.items])

  // ---- item mutations ----
  const saveItem = (form) => {
    mutate(d => {
      if (editing.mode === 'new') {
        const newItem = { id: uid(), ...form }
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
          d.items[i] = { ...d.items[i], ...form }
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

  // ---- column visibility ----
  const toggleColHidden = (key) => {
    mutate(d => {
      d.hiddenCols = { ...d.hiddenCols }
      if (d.hiddenCols[key]) delete d.hiddenCols[key]
      else d.hiddenCols[key] = true
    })
  }
  const visibleCols = data.colOrder.filter(k => !data.hiddenCols[k])

  // ---- CSV export ----
  const ITEM_CSV_COLUMNS = [
    { key: 'num', label: 'Item #' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'sub', label: 'Sub-Category' },
    { key: 'sku', label: 'SKU' },
    { key: 'qty', label: 'On Hand' },
    { key: 'reorder', label: 'Reorder' },
    { key: 'cost', label: 'Unit Cost' },
    { key: 'value', label: 'Value' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status' },
  ]
  const LOG_CSV_COLUMNS = [
    { key: 'ts', label: 'When' },
    { key: 'itemName', label: 'Item' },
    { key: 'delta', label: 'Change' },
    { key: 'after', label: 'On Hand After' },
    { key: 'user', label: 'Who' },
    { key: 'note', label: 'Reason' },
  ]
  const csvRows = () => {
    if (view === 'log') {
      return [...data.log]
        .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
        .map(row => ({
          ts: row.ts || '',
          itemName: row.itemName || '',
          delta: Number(row.delta) || 0,
          after: row.after ?? 0,
          user: row.user || '',
          note: row.note || '',
        }))
    }
    return filteredItems.map(it => ({
      num: it.num || '',
      name: it.name || '',
      category: it.category || '',
      sub: it.sub || '',
      sku: it.sku || '',
      qty: Number(it.qty) || 0,
      reorder: Number(it.reorder) || 0,
      cost: Number(it.cost) || 0,
      value: ((Number(it.qty) || 0) * (Number(it.cost) || 0)).toFixed(2),
      location: it.location || '',
      status: statusOf(it),
    }))
  }

  // Undo/redo over the page's own data — see src/data/useHistory.js
  /* Object.assign onto the draft, not `() => next`. This page's mutate
     hands the mutator a draft and keeps that draft — it ignores what the
     mutator returns — so returning the snapshot threw it away and Undo
     moved the stack without changing a thing. */
  const hist = useHistory(data, next => mutate(d => Object.assign(d, next)),
    { label: 'inventory change', enabled: !loading })

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }


  return (
    <div className="page">

      <PageActions
        {...hist}
        csvName={view === 'log' ? 'crania-inventory-log' : 'crania-inventory'}
        csvColumns={view === 'log' ? LOG_CSV_COLUMNS : ITEM_CSV_COLUMNS}
        csvRows={csvRows}
        backupCollection="stock"
        backupHint="Snapshots of every stock item and its change log (last 14 kept)."
        onRestored={refresh}
        /* Columns moves under the gear; the Log switch and Add Item stay on
           the bar, because switching view and adding stock are what this
           page is for. The tick list opens inline in the panel rather than
           as a popover of its own — you usually change more than one, and a
           menu is a better place for it than a second floating layer. */
        settingsExtra={view === 'inventory' ? (
          <ColumnsMenu
            cols={data.colOrder.map(k => ({ k, l: COLUMN_LABELS[k] || k }))}
            hiddenCols={data.hiddenCols}
            onToggle={k => toggleColHidden(k)} />
        ) : null}
      >
        <button
          onClick={() => setView(v => v === 'log' ? 'inventory' : 'log')}
          style={{
            background: '#fff', border: '1px solid #e2ded2', color: 'var(--brand-dark-brown)',
            padding: '6px 12px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
          }}
        >
          {view === 'log' ? '← Back to Inventory' : '📓 Log'}
        </button>
        {view === 'inventory' && (
          <button onClick={() => setEditing({ mode: 'new', item: null })} title="Add a stock item">
            <Plus size={13} /> Add Item
          </button>
        )}
      </PageActions>

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      {view === 'inventory' ? (
        <>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <MetricTile label="Items"        value={metrics.items} hint={`${metrics.units} units on hand`} />
            <MetricTile label="Low Stock"    value={metrics.low}   hint="at or below reorder level"
              color={metrics.low > 0 ? '#8a6a00' : 'var(--ink)'}
              onClick={() => { setStatusFilter('low');  setSubFilter('all'); setCatFilter('all') }} />
            <MetricTile label="Out of Stock" value={metrics.out}   hint="needs reordering"
              color={metrics.out > 0 ? '#a12626' : 'var(--ink)'}
              onClick={() => { setStatusFilter('out');  setSubFilter('all'); setCatFilter('all') }} />
            <MetricTile label="Stock Value"  value={money(metrics.value)} hint="on hand × unit cost" />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search any column…"
                style={{
                  width: '100%', padding: '7px 8px 7px 30px', fontSize: 13,
                  border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff',
                }}
              />
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
                  {visibleCols.map(key => (
                    <Th key={key} align={COL_ALIGN[key] || 'left'}>{COLUMN_LABELS[key] || key}</Th>
                  ))}
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr><td colSpan={visibleCols.length + 1} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                    {data.items.length === 0
                      ? 'No items yet — click + Add Item to start your inventory.'
                      : 'No items match your filters.'}
                  </td></tr>
                )}
                {filteredItems.map((it, i) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    stripe={i % 2}
                    visibleCols={visibleCols}
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
          <RowCount shown={filteredItems.length} total={data.items.length} />
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
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
        padding: '12px 16px', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

// ---------- Row ----------
function ItemRow({ item, stripe, visibleCols, catColor, subColor, onEdit, onDelete, onBump }) {
  const s = statusOf(item)
  const value = (Number(item.qty) || 0) * (Number(item.cost) || 0)
  const bg = stripe ? '#fafaf7' : '#fff'
  const CELLS = {
    num: <Td mono>{item.num}</Td>,
    name: <Td strong onClick={onEdit} style={{ cursor: 'pointer' }}>{item.name}</Td>,
    category: (
      <Td>
        <span style={{
          background: catColor || '#eee', color: textOn(catColor || '#eee'),
          borderRadius: 5, padding: '2px 8px', fontSize: 12, fontWeight: 600,
        }}>{item.category || '—'}</span>
      </Td>
    ),
    sub: (
      <Td>
        {item.sub ? (
          <span style={{
            background: subColor || '#f4f2ea', color: textOn(subColor || '#f4f2ea'),
            borderRadius: 5, padding: '2px 8px', fontSize: 12,
          }}>{item.sub}</span>
        ) : <span style={{ color: 'var(--muted)' }}>—</span>}
      </Td>
    ),
    sku: <Td muted>{item.sku || '—'}</Td>,
    qty: (
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
    ),
    reorder: <Td align="right" muted>{item.reorder || 0}</Td>,
    cost: <Td align="right" muted>{money(item.cost)}</Td>,
    value: <Td align="right" strong>{money(value)}</Td>,
    location: <Td muted>{item.location || '—'}</Td>,
    status: <Td align="center"><StatusPill status={s} /></Td>,
  }
  return (
    <tr style={{ background: bg, borderTop: '1px solid #f0ede3' }}>
      {visibleCols.map(key => <Fragment key={key}>{CELLS[key]}</Fragment>)}
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
  const [notes,    setNotes]    = useState(initial?.notes || '')

  const [newCategory, setNewCategory] = useState('')
  const [newSub,      setNewSub]      = useState('')

  const catList = useMemo(() => Array.from(new Set([...categories, category].filter(Boolean))), [categories, category])
  const subsForCat = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const it of items) {
      if (it.category === category && it.sub && !seen.has(it.sub)) { out.push(it.sub); seen.add(it.sub) }
    }
    for (const s of extraSubs) {
      if (s.cat === category && s.name && !seen.has(s.name)) { out.push(s.name); seen.add(s.name) }
    }
    return out
  }, [items, extraSubs, category])

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
      notes: notes.trim(),
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Item' : 'New Item'}</h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: '0 0 110px' }}>
            <label>Item #</label>
            <input value={num} onChange={e => setNum(e.target.value)} />
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
            <input
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              placeholder="Or type a new category…"
              style={{ marginTop: 6 }}
            />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Sub-Category</label>
            <select value={sub} onChange={e => { setSub(e.target.value); setNewSub('') }}>
              <option value="">(none)</option>
              {subsForCat.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={newSub}
              onChange={e => setNewSub(e.target.value)}
              placeholder="Or type a new sub…"
              style={{ marginTop: 6 }}
            />
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
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Unit Cost ($)</label>
            <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} />
          </div>
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
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search the log…"
            style={{ width: 250, padding: '7px 8px 7px 30px', fontSize: 13,
                     border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }}
          />
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
      <RowCount shown={filtered.length} total={log.length} />
    </div>
  )
}
