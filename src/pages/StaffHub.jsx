import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X, GripVertical, Trash2 } from 'lucide-react'

// Trello-style board: lists (columns) of cards (tasks).
// Persisted on the API as a single JSON document at /api/staff-board.

const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:4000'
const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

const DEFAULT_BOARD = {
  lists: [
    { id: 'l1', title: 'To Do', cards: [] },
    { id: 'l2', title: 'In Progress', cards: [] },
    { id: 'l3', title: 'Done', cards: [] },
  ],
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

// Drag-and-drop state lives in a module-level ref so the dragged item survives
// through React re-renders during the drag.
const dragState = { type: null, listId: null, cardId: null }

export default function StaffHub() {
  const [board, setBoard] = useState(DEFAULT_BOARD)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const [openCard, setOpenCard] = useState(null) // { listId, card }

  // Load
  useEffect(() => {
    fetch(`${API_BASE}/api/staff-board`, { headers: HEADERS })
      .then(r => r.ok ? r.json() : DEFAULT_BOARD)
      .then(data => {
        if (data && Array.isArray(data.lists)) setBoard(data)
        setStatus('online')
      })
      .catch(() => setStatus('offline'))
  }, [])

  // Save (debounced)
  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/staff-board`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(next),
      }).catch(() => {})
    }, 400)
  }, [])

  const update = (next) => { setBoard(next); persist(next) }

  // List mutations
  const addList = () => {
    const title = prompt('List title?')
    if (!title) return
    update({ ...board, lists: [...board.lists, { id: newId(), title, cards: [] }] })
  }
  const deleteList = (listId) => {
    if (!confirm('Delete this list and all its cards?')) return
    update({ ...board, lists: board.lists.filter(l => l.id !== listId) })
  }
  const renameList = (listId, title) => {
    update({ ...board, lists: board.lists.map(l => l.id === listId ? { ...l, title } : l) })
  }

  // Card mutations
  const addCard = (listId, title) => {
    if (!title || !title.trim()) return
    const card = { id: newId(), title: title.trim(), description: '', labels: [], assignee: '', due: '' }
    update({
      ...board,
      lists: board.lists.map(l => l.id === listId ? { ...l, cards: [...l.cards, card] } : l),
    })
  }
  const updateCard = (listId, cardId, patch) => {
    const next = {
      ...board,
      lists: board.lists.map(l => l.id === listId
        ? { ...l, cards: l.cards.map(c => c.id === cardId ? { ...c, ...patch } : c) }
        : l),
    }
    update(next)
    if (openCard && openCard.card.id === cardId) {
      const updated = next.lists.find(l => l.id === listId).cards.find(c => c.id === cardId)
      setOpenCard({ listId, card: updated })
    }
  }
  const deleteCard = (listId, cardId) => {
    update({
      ...board,
      lists: board.lists.map(l => l.id === listId
        ? { ...l, cards: l.cards.filter(c => c.id !== cardId) }
        : l),
    })
    if (openCard && openCard.card.id === cardId) setOpenCard(null)
  }

  // Move card between/within lists (via drag-and-drop)
  const moveCard = (sourceListId, cardId, targetListId, targetIdx) => {
    if (!cardId) return
    const sourceList = board.lists.find(l => l.id === sourceListId)
    const card = sourceList && sourceList.cards.find(c => c.id === cardId)
    if (!card) return
    const lists = board.lists.map(l => {
      if (l.id === sourceListId) return { ...l, cards: l.cards.filter(c => c.id !== cardId) }
      return l
    }).map(l => {
      if (l.id === targetListId) {
        const cards = [...l.cards]
        cards.splice(targetIdx == null ? cards.length : targetIdx, 0, card)
        return { ...l, cards }
      }
      return l
    })
    update({ ...board, lists })
  }

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 className="page-title" style={{ marginRight: 'auto' }}>Staff Hub</h2>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
          {status === 'loading' ? 'Loading…' : status === 'offline' ? 'Offline — changes local only' : 'Auto-saving'}
        </div>
        <button className="icon-btn solid" onClick={addList} title="Add list"><Plus size={20} /></button>
      </div>

      {/* Board scroll area */}
      <div style={{
        display: 'flex', gap: 14, overflowX: 'auto', alignItems: 'flex-start',
        paddingBottom: 14, minHeight: 'calc(100vh - 240px)',
      }}>
        {board.lists.map(list => (
          <BoardList
            key={list.id}
            list={list}
            onRename={(t) => renameList(list.id, t)}
            onDelete={() => deleteList(list.id)}
            onAddCard={(t) => addCard(list.id, t)}
            onOpenCard={(card) => setOpenCard({ listId: list.id, card })}
            onMove={moveCard}
          />
        ))}
        <button onClick={addList} style={{
          minWidth: 280, padding: '12px 16px', background: '#eef1f2', border: '2px dashed var(--line)',
          borderRadius: 10, cursor: 'pointer', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13,
          fontFamily: 'inherit',
        }}>+ Add list</button>
      </div>

      {openCard && (
        <CardModal
          listTitle={(board.lists.find(l => l.id === openCard.listId) || {}).title}
          card={openCard.card}
          onClose={() => setOpenCard(null)}
          onChange={(patch) => updateCard(openCard.listId, openCard.card.id, patch)}
          onDelete={() => deleteCard(openCard.listId, openCard.card.id)}
        />
      )}
    </div>
  )
}

function BoardList({ list, onRename, onDelete, onAddCard, onOpenCard, onMove }) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(list.title)
  const [dragOver, setDragOver] = useState(false)

  const commitTitle = () => {
    if (titleDraft.trim() && titleDraft !== list.title) onRename(titleDraft.trim())
    setEditingTitle(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (dragState.type !== 'card') return
    onMove(dragState.listId, dragState.cardId, list.id, list.cards.length)
    dragState.type = null
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        minWidth: 280, maxWidth: 280, background: dragOver ? '#dfecef' : '#f0f4f5',
        borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
        border: '1px solid var(--line)',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleDraft(list.title); setEditingTitle(false) } }}
            style={{ flex: 1, border: '1px solid var(--logo-teal)', borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700 }}
          />
        ) : (
          <div onClick={() => { setTitleDraft(list.title); setEditingTitle(true) }}
            style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', padding: '4px 2px' }}>
            {list.title} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {list.cards.length}</span>
          </div>
        )}
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
          title="Delete list">
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.cards.map((card, idx) => (
          <BoardCard
            key={card.id}
            card={card}
            listId={list.id}
            onClick={() => onOpenCard(card)}
            onDropBefore={() => {
              if (dragState.type !== 'card') return
              onMove(dragState.listId, dragState.cardId, list.id, idx)
              dragState.type = null
            }}
          />
        ))}
      </div>

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Card title…"
            style={{ width: '100%', border: '1px solid var(--logo-teal)', borderRadius: 6, padding: 8, fontFamily: 'inherit', fontSize: 13, resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { onAddCard(newTitle); setNewTitle(''); setAdding(false) }}
              style={{ background: 'var(--logo-teal)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
              Add
            </button>
            <button onClick={() => { setNewTitle(''); setAdding(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px 8px' }}>
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          background: 'none', border: 'none', textAlign: 'left',
          color: 'var(--ink-soft)', padding: '6px 4px', cursor: 'pointer',
          fontSize: 13, fontFamily: 'inherit',
        }}>+ Add a card</button>
      )}
    </div>
  )
}

function BoardCard({ card, listId, onClick, onDropBefore }) {
  return (
    <div
      draggable
      onDragStart={() => { dragState.type = 'card'; dragState.listId = listId; dragState.cardId = card.id }}
      onDragEnd={() => { dragState.type = null }}
      onDragOver={e => e.preventDefault()}
      onDrop={(e) => { e.stopPropagation(); onDropBefore() }}
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
        padding: 10, cursor: 'pointer', fontSize: 13, color: 'var(--ink)',
        boxShadow: '0 1px 2px rgba(0,0,0,.04)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
      {(card.labels && card.labels.length > 0) && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {card.labels.map((lbl, i) => (
            <span key={i} style={{
              fontSize: 10, background: 'var(--logo-teal)', color: '#fff',
              padding: '2px 6px', borderRadius: 3, fontWeight: 600,
            }}>{lbl}</span>
          ))}
        </div>
      )}
      <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{card.title}</div>
      {(card.assignee || card.due) && (
        <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
          {card.assignee && <span>👤 {card.assignee}</span>}
          {card.due && <span>📅 {card.due}</span>}
        </div>
      )}
    </div>
  )
}

function CardModal({ listTitle, card, onClose, onChange, onDelete }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '90%', maxWidth: 600, maxHeight: '80vh', overflowY: 'auto',
        background: '#fff', borderRadius: 10, padding: 24,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input
            value={card.title}
            onChange={e => onChange({ title: e.target.value })}
            style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 18, fontWeight: 700, color: 'var(--ink)', padding: 0 }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>in list <strong>{listTitle}</strong></div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
          <textarea
            value={card.description || ''}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="Add a description…"
            style={{ width: '100%', minHeight: 120, padding: 10, borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Assignee</div>
            <input
              value={card.assignee || ''}
              onChange={e => onChange({ assignee: e.target.value })}
              placeholder="Name"
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Due</div>
            <input
              type="date"
              value={card.due || ''}
              onChange={e => onChange({ due: e.target.value })}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Labels (comma-separated)</div>
          <input
            value={(card.labels || []).join(', ')}
            onChange={e => onChange({ labels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="e.g. urgent, payroll"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { if (confirm('Delete this card?')) onDelete() }}
            style={{ background: '#f3eded', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', color: 'var(--danger)', fontWeight: 600, fontSize: 12 }}>
            Delete card
          </button>
        </div>
      </div>
    </div>
  )
}
