import { useState } from 'react'
import { Check, Filter, Plus, X } from 'lucide-react'
import { todos as seed } from '../data/mockData'

const PRI = {
  1: { label: 'Urgent',   pill: 'var(--pri-red)',    bar: 'var(--pri-red-soft)' },
  2: { label: 'High',     pill: 'var(--pri-yellow)', bar: 'var(--pri-yellow-soft)' },
  3: { label: 'Normal',   pill: 'var(--pri-green)',  bar: 'var(--pri-green-soft)' },
  4: { label: 'Low',      pill: 'var(--pri-blue)',   bar: 'var(--pri-blue-soft)' },
}

const CATEGORIES = ['Students', 'Customers', 'Staff', 'Marketing', 'Technology', 'Curriculum', 'Finance', 'Operations', 'Other']

const CAT_COLORS = {
  Students:   { bg: '#e8f4fb', border: '#a6d8f0', text: '#1a5c7a' },
  Customers:  { bg: '#fdf0e6', border: '#f5c89a', text: '#7a4010' },
  Staff:      { bg: '#eff8ef', border: '#a8d8a8', text: '#1a5a1a' },
  Marketing:  { bg: '#f3eefb', border: '#c5a8e8', text: '#4a1a7a' },
  Technology: { bg: '#eaf0fb', border: '#a4bce8', text: '#1a347a' },
  Curriculum: { bg: '#fef9e6', border: '#f0d87a', text: '#6a5000' },
  Finance:    { bg: '#fdeef0', border: '#e8a8b0', text: '#7a1a28' },
  Operations: { bg: '#f0f0f0', border: '#c0c4c8', text: '#3a3a3a' },
  Other:      { bg: '#f7f3ee', border: '#d4c4b0', text: '#5a4a38' },
}

const BLANK = { category: 'Students', priority: 2, task: '', due: '', done: false }

export default function ToDo() {
  const [rows, setRows] = useState(seed)
  const [showDone, setShowDone] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(BLANK)

  const toggle = (id) => setRows(rows.map(r => r.id === id ? { ...r, done: !r.done } : r))

  const openAdd = () => { setForm(BLANK); setModal(true) }
  const closeModal = () => setModal(false)

  const save = () => {
    if (!form.task.trim()) return
    const id = Math.max(0, ...rows.map(r => r.id)) + 1
    setRows([...rows, { ...form, id, task: form.task.trim() }])
    setModal(false)
  }

  const visible = showDone ? rows : rows.filter(r => !r.done)

  // Group by category in the defined order
  const groups = CATEGORIES
    .map(cat => ({ cat, items: visible.filter(r => r.category === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">To Do</h2>
        <div className="head-actions">
          <button className="icon-btn" title="Show / hide completed" onClick={() => setShowDone(s => !s)}>
            <Filter size={22} fill={showDone ? 'none' : '#111418'} />
          </button>
          <button className="icon-btn solid" title="Add task" onClick={openAdd}><Plus size={22} /></button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map(({ cat, items }) => {
          const c = CAT_COLORS[cat] ?? CAT_COLORS.Other
          return (
            <div key={cat} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,30,45,.07)' }}>
              {/* Category header */}
              <div style={{
                background: '#fafbfc',
                borderLeft: `5px solid ${c.border}`,
                borderBottom: '1px solid var(--line)',
                padding: '10px 18px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{
                  fontWeight: 800, fontSize: 13, letterSpacing: '.6px',
                  textTransform: 'uppercase', color: c.text,
                }}>{cat}</span>
                <span style={{
                  background: c.border, color: c.text,
                  borderRadius: 999, fontSize: 11, fontWeight: 700,
                  padding: '2px 8px',
                }}>{items.length}</span>
              </div>

              {/* Tasks table */}
              <table className="grid" style={{ margin: 0 }}>
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 70 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>PRIORITY</th>
                    <th>TASK</th>
                    <th>DUE DATE</th>
                    <th>DONE</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => (
                    <tr key={r.id} style={{ opacity: r.done ? 0.5 : 1 }}>
                      <td>
                        <div className="chip-pill" style={{ background: PRI[r.priority].pill, fontSize: 12 }}>
                          {PRI[r.priority].label}
                        </div>
                      </td>
                      <td>
                        <div className="task-bar" style={{ background: PRI[r.priority].bar, textDecoration: r.done ? 'line-through' : 'none' }}>
                          {r.task}
                        </div>
                      </td>
                      <td><div className="due-chip">{r.due || '—'}</div></td>
                      <td>
                        <div style={{ display: 'grid', placeItems: 'center', height: 42 }}>
                          <div className={'cbx' + (r.done ? ' checked' : '')} onClick={() => toggle(r.id)}>
                            {r.done && <Check size={18} strokeWidth={3} />}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>

      {/* Add Task Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,25,40,.45)',
          display: 'grid', placeItems: 'center', zIndex: 200,
        }} onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={{
            background: '#fff', borderRadius: 16, width: 480, maxWidth: 'calc(100vw - 32px)',
            boxShadow: '0 20px 60px rgba(15,25,40,.2)', overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              background: 'var(--header-blue)', padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 700 }}>New Task</span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Category</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {CATEGORIES.map(cat => {
                    const c = CAT_COLORS[cat] ?? CAT_COLORS.Other
                    const active = form.category === cat
                    return (
                      <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat }))} style={{
                        border: `2px solid ${active ? c.border : 'var(--line)'}`,
                        background: active ? c.bg : '#fafbfc',
                        color: active ? c.text : 'var(--ink-soft)',
                        borderRadius: 8, padding: '6px 12px',
                        fontSize: 13, fontWeight: active ? 700 : 500,
                        cursor: 'pointer', transition: 'all .15s',
                      }}>{cat}</button>
                    )
                  })}
                </div>
              </div>

              {/* Task */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Task</label>
                <input
                  className="reg-input"
                  placeholder="Describe the task…"
                  value={form.task}
                  onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && save()}
                  autoFocus
                />
              </div>

              {/* Priority */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Priority</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4].map(p => (
                    <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))} style={{
                      flex: 1,
                      background: form.priority === p ? PRI[p].pill : '#f1f3f4',
                      border: `2px solid ${form.priority === p ? PRI[p].pill : 'transparent'}`,
                      borderRadius: 8, padding: '8px 4px',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      color: form.priority === p ? '#2a2a2a' : 'var(--ink-soft)',
                      transition: 'all .15s',
                    }}>{PRI[p].label}</button>
                  ))}
                </div>
              </div>

              {/* Due date */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7, letterSpacing: '.4px', textTransform: 'uppercase' }}>Due Date</label>
                <input
                  className="reg-input"
                  placeholder="e.g. Jun 30"
                  value={form.due}
                  onChange={e => setForm(f => ({ ...f, due: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && save()}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '0 24px 22px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={closeModal}>Cancel</button>
              <button className="btn" onClick={save} disabled={!form.task.trim()} style={{ opacity: form.task.trim() ? 1 : 0.45 }}>
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
