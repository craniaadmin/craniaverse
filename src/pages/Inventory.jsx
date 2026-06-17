import { useState } from 'react'
import { Plus, X, AlertTriangle } from 'lucide-react'

const LOW_STOCK = 5

const CATEGORIES = ['Shirts', 'Bags', 'Other']

const CAT_COLOR = {
  Shirts: '#5FA09E',
  Bags:   '#7a5fae',
  Other:  '#a07a3a',
}

const SHIRT_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'XS', 'S', 'M', 'L', 'XL', 'XXL']

const SEED = [
  // Shirts — kids
  { id: 1,  category: 'Shirts', name: 'T-Shirt', size: 'YXS', qty: 8,  price: 15 },
  { id: 2,  category: 'Shirts', name: 'T-Shirt', size: 'YS',  qty: 10, price: 15 },
  { id: 3,  category: 'Shirts', name: 'T-Shirt', size: 'YM',  qty: 14, price: 15 },
  { id: 4,  category: 'Shirts', name: 'T-Shirt', size: 'YL',  qty: 6,  price: 15 },
  { id: 5,  category: 'Shirts', name: 'T-Shirt', size: 'YXL', qty: 4,  price: 15 },
  // Shirts — adult
  { id: 6,  category: 'Shirts', name: 'T-Shirt', size: 'XS',  qty: 3,  price: 18 },
  { id: 7,  category: 'Shirts', name: 'T-Shirt', size: 'S',   qty: 9,  price: 18 },
  { id: 8,  category: 'Shirts', name: 'T-Shirt', size: 'M',   qty: 11, price: 18 },
  { id: 9,  category: 'Shirts', name: 'T-Shirt', size: 'L',   qty: 7,  price: 18 },
  { id: 10, category: 'Shirts', name: 'T-Shirt', size: 'XL',  qty: 2,  price: 18 },
  { id: 11, category: 'Shirts', name: 'T-Shirt', size: 'XXL', qty: 1,  price: 18 },
  // Bags
  { id: 12, category: 'Bags', name: 'Tote Bag',  size: null, qty: 18, price: 12 },
  { id: 13, category: 'Bags', name: 'Backpack',  size: null, qty: 5,  price: 35 },
  // Other
  { id: 14, category: 'Other', name: 'Water Bottle', size: null, qty: 20, price: 22 },
  { id: 15, category: 'Other', name: 'Pencil Case',  size: null, qty: 30, price: 8  },
  { id: 16, category: 'Other', name: 'Lanyard',      size: null, qty: 3,  price: 5  },
]

const BLANK = { category: 'Shirts', name: '', size: 'YS', qty: 0, price: 0 }

function QtyControl({ qty, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => onChange(Math.max(0, qty - 1))}
        style={{
          width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line)',
          background: '#f1f3f4', fontWeight: 700, fontSize: 16, cursor: 'pointer',
          display: 'grid', placeItems: 'center', color: 'var(--ink-soft)',
        }}>−</button>
      <span style={{
        minWidth: 32, textAlign: 'center', fontWeight: 700, fontSize: 15,
        color: qty <= LOW_STOCK ? '#c62828' : 'var(--ink)',
      }}>{qty}</span>
      <button
        onClick={() => onChange(qty + 1)}
        style={{
          width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line)',
          background: '#f1f3f4', fontWeight: 700, fontSize: 16, cursor: 'pointer',
          display: 'grid', placeItems: 'center', color: 'var(--ink-soft)',
        }}>+</button>
    </div>
  )
}

export default function Inventory() {
  const [items, setItems] = useState(SEED)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(BLANK)

  const updateQty = (id, qty) => setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i))

  const save = () => {
    if (!form.name.trim()) return
    const id = Math.max(0, ...items.map(i => i.id)) + 1
    setItems(prev => [...prev, { ...form, id, name: form.name.trim(), qty: Number(form.qty) || 0, price: Number(form.price) || 0 }])
    setModal(false)
  }

  const totalItems = items.reduce((s, i) => s + i.qty, 0)
  const lowStockCount = items.filter(i => i.qty <= LOW_STOCK && i.qty > 0).length
  const outOfStock = items.filter(i => i.qty === 0).length
  const totalValue = items.reduce((s, i) => s + i.qty * i.price, 0)

  const groups = CATEGORIES
    .map(cat => ({ cat, items: items.filter(i => i.category === cat) }))
    .filter(g => g.items.length > 0)

  const hasSize = form.category === 'Shirts'

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Inventory</h2>
        <button className="icon-btn solid" title="Add item" onClick={() => { setForm(BLANK); setModal(true) }}>
          <Plus size={22} />
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Units',  value: totalItems,              color: 'var(--ink)' },
          { label: 'Low Stock',    value: lowStockCount,           color: lowStockCount > 0 ? '#cc7800' : 'var(--ink)' },
          { label: 'Out of Stock', value: outOfStock,              color: outOfStock > 0 ? '#c62828' : 'var(--ink)' },
          { label: 'Total Value',  value: `$${totalValue.toLocaleString()}`, color: 'var(--ink)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
            padding: '14px 18px', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Category groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map(({ cat, items: catItems }) => (
          <div key={cat} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,30,45,.07)' }}>

            {/* Category header */}
            <div style={{
              borderLeft: `5px solid ${CAT_COLOR[cat]}`,
              borderBottom: '1px solid var(--line)',
              background: '#fafbfc',
              padding: '10px 18px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '.6px', textTransform: 'uppercase', color: CAT_COLOR[cat] }}>
                {cat}
              </span>
              <span style={{ background: CAT_COLOR[cat], color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                {catItems.length}
              </span>
              {catItems.some(i => i.qty <= LOW_STOCK) && (
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#cc7800' }}>
                  <AlertTriangle size={13} /> Low stock
                </span>
              )}
            </div>

            {/* Items table */}
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'left', padding: '4px 14px' }}>ITEM</th>
                  {cat === 'Shirts' && <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'center', padding: '4px 14px', width: 80 }}>SIZE</th>}
                  <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'center', padding: '4px 14px', width: 140 }}>QTY IN STOCK</th>
                  <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'right', padding: '4px 18px', width: 100 }}>PRICE</th>
                  <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'right', padding: '4px 18px', width: 120 }}>VALUE</th>
                </tr>
              </thead>
              <tbody>
                {catItems.map(item => {
                  const low = item.qty <= LOW_STOCK && item.qty > 0
                  const out = item.qty === 0
                  return (
                    <tr key={item.id} style={{ opacity: out ? 0.55 : 1 }}>
                      <td style={{ padding: '0 0 0 14px' }}>
                        <div style={{
                          background: out ? '#fff0f0' : low ? '#fffbf0' : 'var(--field-bg-soft)',
                          borderRadius: 7, padding: '10px 14px', fontSize: 14, fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          {item.name}
                          {out && <span style={{ fontSize: 11, fontWeight: 700, color: '#c62828', background: '#fde0e0', borderRadius: 4, padding: '2px 7px' }}>OUT</span>}
                        </div>
                      </td>
                      {cat === 'Shirts' && (
                        <td style={{ padding: '0 6px' }}>
                          <div style={{
                            background: CAT_COLOR[cat] + '22', color: CAT_COLOR[cat],
                            borderRadius: 7, padding: '10px 0', fontSize: 13, fontWeight: 800,
                            textAlign: 'center',
                          }}>{item.size}</div>
                        </td>
                      )}
                      <td style={{ padding: '0 6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                          <QtyControl qty={item.qty} onChange={qty => updateQty(item.id, qty)} />
                        </div>
                      </td>
                      <td style={{ padding: '0 6px' }}>
                        <div style={{ background: 'var(--field-bg-soft)', borderRadius: 7, padding: '10px 14px', fontSize: 13, color: 'var(--ink-soft)', textAlign: 'right' }}>
                          ${item.price}
                        </div>
                      </td>
                      <td style={{ padding: '0 14px 0 6px' }}>
                        <div style={{ background: 'var(--field-bg-soft)', borderRadius: 7, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>
                          ${(item.qty * item.price).toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ height: 8 }} />
          </div>
        ))}
      </div>

      {/* Add Item Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,25,40,.45)',
          display: 'grid', placeItems: 'center', zIndex: 200,
        }} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, width: 460, maxWidth: 'calc(100vw - 32px)',
            boxShadow: '0 20px 60px rgba(15,25,40,.2)', overflow: 'hidden',
          }}>
            <div style={{
              background: 'var(--header-blue)', padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 700 }}>New Item</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--ink-soft)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Category</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat, size: cat === 'Shirts' ? 'YS' : null }))} style={{
                      flex: 1, border: `2px solid ${form.category === cat ? CAT_COLOR[cat] : 'var(--line)'}`,
                      background: form.category === cat ? CAT_COLOR[cat] + '18' : '#fafbfc',
                      color: form.category === cat ? CAT_COLOR[cat] : 'var(--ink-soft)',
                      borderRadius: 8, padding: '8px 4px', fontSize: 13,
                      fontWeight: form.category === cat ? 700 : 500, cursor: 'pointer',
                    }}>{cat}</button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Item Name</label>
                <input
                  className="reg-input"
                  placeholder="e.g. T-Shirt, Tote Bag…"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              {/* Size (shirts only) */}
              {hasSize && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Size</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {SHIRT_SIZES.map(sz => (
                      <button key={sz} onClick={() => setForm(f => ({ ...f, size: sz }))} style={{
                        border: `2px solid ${form.size === sz ? CAT_COLOR.Shirts : 'var(--line)'}`,
                        background: form.size === sz ? CAT_COLOR.Shirts + '18' : '#fafbfc',
                        color: form.size === sz ? CAT_COLOR.Shirts : 'var(--ink-soft)',
                        borderRadius: 7, padding: '6px 12px', fontSize: 13,
                        fontWeight: form.size === sz ? 700 : 500, cursor: 'pointer',
                      }}>{sz}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Qty + Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Qty in Stock</label>
                  <input
                    className="reg-input"
                    type="number" min="0"
                    placeholder="0"
                    value={form.qty}
                    onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Price ($)</label>
                  <input
                    className="reg-input"
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '0 24px 22px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn" onClick={save} disabled={!form.name.trim()} style={{ opacity: form.name.trim() ? 1 : 0.45 }}>
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
