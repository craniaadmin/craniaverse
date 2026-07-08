import { useState } from 'react'
import { Plus, X, AlertTriangle } from 'lucide-react'

const LOW_STOCK = 5

const SHIRT_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'XS', 'S', 'M', 'L', 'XL', 'XXL']
const COMMON_SIZES = ['One Size', ...SHIRT_SIZES]

const SEED = [
  { id: 1,  category: 'Apparel', name: 'T-Shirt', size: 'YXS', qty: 8,  price: 15 },
  { id: 2,  category: 'Apparel', name: 'T-Shirt', size: 'YS',  qty: 10, price: 15 },
  { id: 3,  category: 'Apparel', name: 'T-Shirt', size: 'YM',  qty: 14, price: 15 },
]

const BLANK = { category: '', name: '', size: null, qty: 0, price: 0, newCategory: '' }

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

  const categories = [...new Set(items.map(i => i.category))].sort()
  const uniqueSizes = [...new Set(items.filter(i => i.size).map(i => i.size))].sort()
  const hasItemsWithSize = items.some(i => i.size)

  const updateQty = (id, qty) => setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i))
  const deleteItem = (id) => setItems(prev => prev.filter(i => i.id !== id))

  const save = () => {
    if (!form.name.trim() || !form.category.trim()) return
    const finalCategory = form.newCategory.trim() || form.category
    const id = Math.max(0, ...items.map(i => i.id)) + 1
    setItems(prev => [...prev, {
      ...form,
      id,
      category: finalCategory,
      name: form.name.trim(),
      size: form.size || null,
      qty: Number(form.qty) || 0,
      price: Number(form.price) || 0,
    }])
    setModal(false)
    setForm(BLANK)
  }

  const totalItems = items.reduce((s, i) => s + i.qty, 0)
  const lowStockCount = items.filter(i => i.qty <= LOW_STOCK && i.qty > 0).length
  const outOfStock = items.filter(i => i.qty === 0).length
  const totalValue = items.reduce((s, i) => s + i.qty * i.price, 0)

  const sorted = [...items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

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

      {/* Items table */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,30,45,.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0' }}>
          <thead>
            <tr style={{ background: '#f5f7f8', borderBottom: '1px solid var(--line)' }}>
              <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'left', padding: '12px 16px' }}>ITEM</th>
              <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'left', padding: '12px 16px' }}>CATEGORY</th>
              {hasItemsWithSize && <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'center', padding: '12px 16px', width: 80 }}>SIZE</th>}
              <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'center', padding: '12px 16px', width: 140 }}>QTY</th>
              <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'right', padding: '12px 16px', width: 100 }}>PRICE</th>
              <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'right', padding: '12px 16px', width: 120 }}>VALUE</th>
              <th style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'center', padding: '12px 16px', width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={hasItemsWithSize ? 7 : 6} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                  No items yet. Add one to get started.
                </td>
              </tr>
            ) : (
              sorted.map((item, idx) => {
                const low = item.qty <= LOW_STOCK && item.qty > 0
                const out = item.qty === 0
                return (
                  <tr key={item.id} style={{
                    borderBottom: idx < sorted.length - 1 ? '1px solid var(--line)' : 'none',
                    opacity: out ? 0.6 : 1,
                  }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        {item.name}
                        {out && <span style={{ fontSize: 11, fontWeight: 700, color: '#c62828', background: '#fde0e0', borderRadius: 4, padding: '2px 7px' }}>OUT</span>}
                        {low && <span style={{ fontSize: 11, fontWeight: 700, color: '#cc7800', background: '#fffbf0', borderRadius: 4, padding: '2px 7px' }}>LOW</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-soft)' }}>
                      {item.category}
                    </td>
                    {hasItemsWithSize && (
                      <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center', color: 'var(--ink-soft)' }}>
                        {item.size || '—'}
                      </td>
                    )}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <QtyControl qty={item.qty} onChange={qty => updateQty(item.id, qty)} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--ink-soft)' }}>
                      ${item.price.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                      ${(item.qty * item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4 }} title="Delete item">
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Item Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,25,40,.45)',
          display: 'grid', placeItems: 'center', zIndex: 200, padding: 16,
        }} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, width: 500, maxWidth: '100%',
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

            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>

              {/* Item Name */}
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

              {/* Category - select from existing or add new */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Category</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat, newCategory: '' }))} style={{
                      border: `2px solid ${form.category === cat && !form.newCategory ? 'var(--logo-teal)' : 'var(--line)'}`,
                      background: form.category === cat && !form.newCategory ? '#5FA09E18' : '#fafbfc',
                      color: form.category === cat && !form.newCategory ? 'var(--logo-teal)' : 'var(--ink-soft)',
                      borderRadius: 8, padding: '8px 12px', fontSize: 13,
                      fontWeight: form.category === cat && !form.newCategory ? 700 : 500, cursor: 'pointer',
                    }}>{cat}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>or create new:</div>
                <input
                  className="reg-input"
                  placeholder="New category name"
                  value={form.newCategory}
                  onChange={e => setForm(f => ({ ...f, newCategory: e.target.value, category: e.target.value ? e.target.value : f.category }))}
                />
              </div>

              {/* Size (optional) */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Size (Optional)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  <button onClick={() => setForm(f => ({ ...f, size: null }))} style={{
                    border: `2px solid ${!form.size ? 'var(--logo-teal)' : 'var(--line)'}`,
                    background: !form.size ? '#5FA09E18' : '#fafbfc',
                    color: !form.size ? 'var(--logo-teal)' : 'var(--ink-soft)',
                    borderRadius: 7, padding: '6px 12px', fontSize: 13,
                    fontWeight: !form.size ? 700 : 500, cursor: 'pointer',
                  }}>None</button>
                  {COMMON_SIZES.map(sz => (
                    <button key={sz} onClick={() => setForm(f => ({ ...f, size: sz }))} style={{
                      border: `2px solid ${form.size === sz ? 'var(--logo-teal)' : 'var(--line)'}`,
                      background: form.size === sz ? '#5FA09E18' : '#fafbfc',
                      color: form.size === sz ? 'var(--logo-teal)' : 'var(--ink-soft)',
                      borderRadius: 7, padding: '6px 12px', fontSize: 13,
                      fontWeight: form.size === sz ? 700 : 500, cursor: 'pointer',
                    }}>{sz}</button>
                  ))}
                </div>
              </div>

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
              <button className="btn" onClick={save} disabled={!form.name.trim() || !(form.category || form.newCategory)} style={{ opacity: (form.name.trim() && (form.category || form.newCategory)) ? 1 : 0.45 }}>
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
