import { useState } from 'react'
import { Check, Filter, Plus } from 'lucide-react'
import { todos as seed } from '../data/mockData'

const PRI = {
  1: { pill: 'var(--pri-red)', bar: 'var(--pri-red-soft)' },
  2: { pill: 'var(--pri-yellow)', bar: 'var(--pri-yellow-soft)' },
  3: { pill: 'var(--pri-green)', bar: 'var(--pri-green-soft)' },
  4: { pill: 'var(--pri-blue)', bar: 'var(--pri-blue-soft)' },
}

export default function ToDo() {
  const [rows, setRows] = useState(seed)
  const [showDone, setShowDone] = useState(true)

  const toggle = (id) => setRows(rows.map(r => r.id === id ? { ...r, done: !r.done } : r))
  const add = () => {
    const id = Math.max(0, ...rows.map(r => r.id)) + 1
    setRows([...rows, { id, category: 'Other', priority: 2, task: 'New task…', due: 'TBD', done: false }])
  }
  const visible = showDone ? rows : rows.filter(r => !r.done)

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">To Do</h2>
        <div className="head-actions">
          <button className="icon-btn" title="Show / hide completed" onClick={() => setShowDone(s => !s)}>
            <Filter size={22} fill={showDone ? 'none' : '#111418'} />
          </button>
          <button className="icon-btn solid" title="Add task" onClick={add}><Plus size={22} /></button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 150 }}>CATEGORY</th>
              <th style={{ width: 110 }}>PRIORITY</th>
              <th>TASK</th>
              <th style={{ width: 120 }}>DUE DATE</th>
              <th style={{ width: 70 }}>DONE</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td><div className="cell-chip" style={{ justifyContent: 'center', fontWeight: 600 }}>{r.category}</div></td>
                <td><div className="chip-pill" style={{ background: PRI[r.priority].pill }}>{r.priority}</div></td>
                <td><div className="task-bar" style={{ background: PRI[r.priority].bar }}>{r.task}</div></td>
                <td><div className="due-chip">{r.due}</div></td>
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
    </div>
  )
}
