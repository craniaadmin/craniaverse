// Undo/redo for a page whose data does not live in one piece of state.
//
// useHistory watches a value and replaces it. That only works where the
// page owns the whole thing and has a setter for it. Several pages write
// into the shared store one field at a time, or POST an entry to a log —
// there is no bulk setter to hand a snapshot to, and replacing the table
// to undo one edit would throw away everyone else's changes in between.
//
// So those pages record the action instead: as each mutation happens the
// caller pushes { label, undo, redo }, two closures that know how to take
// that one change back and put it again.
//
//   const hist = useActionHistory()
//   hist.push({ label: 'Mark Ada present', undo: () => set('A'), redo: () => set('P') })
//   <PageActions {...hist} />
//
// The Customers and Staff lists grew this shape independently; this is
// that pattern factored out, so all of them behave the same way — same
// stack depth, same Ctrl+Z guards, same wording in the note.

import { useCallback, useEffect, useRef, useState } from 'react'

/* Ctrl+Z inside a text box has to undo the typing. Without this the
   page-level shortcut fires while someone is mid-word and throws away
   the sentence they were writing. */
function inEditableField(el) {
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

export default function useActionHistory(opts = {}) {
  const { max = 20, enabled = true, noteMs = 6000 } = opts

  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [histBusy, setHistBusy] = useState(false)
  const [histNote, setHistNote] = useState('')

  // The note reports something that already happened, so it clears itself
  // rather than needing to be dismissed.
  useEffect(() => {
    if (!histNote) return undefined
    const t = setTimeout(() => setHistNote(''), noteMs)
    return () => clearTimeout(t)
  }, [histNote, noteMs])

  const push = useCallback((entry) => {
    if (!entry || typeof entry.undo !== 'function' || typeof entry.redo !== 'function') return
    setUndoStack(s => [...s.slice(-(max - 1)), entry])
    setRedoStack([])
  }, [max])

  const clear = useCallback(() => { setUndoStack([]); setRedoStack([]) }, [])

  /* A ref, not the state flag: two keypresses in the same tick would both
     read the old state and both run, stepping twice through the stack. */
  const running = useRef(false)

  const run = useCallback(async (from, setFrom, setTo, dir) => {
    const entry = from[from.length - 1]
    if (!entry || running.current) return
    running.current = true
    setHistBusy(true)
    try {
      await (dir === 'undo' ? entry.undo() : entry.redo())
      setFrom(s => s.slice(0, -1))
      setTo(s => [...s.slice(-(max - 1)), entry])
      /* Say what happened. A change made somewhere off-screen — a mark on
         a register two days back, a balance on another student — should
         not be something you only notice later. */
      setHistNote(`${dir === 'undo' ? 'Undid' : 'Redid'}: ${entry.label}`)
    } catch (err) {
      setHistNote(`Could not ${dir}: ${String(err?.message || err)}`)
    }
    running.current = false
    setHistBusy(false)
  }, [max])

  const onUndo = useCallback(
    () => run(undoStack, setUndoStack, setRedoStack, 'undo'), [run, undoStack])
  const onRedo = useCallback(
    () => run(redoStack, setRedoStack, setUndoStack, 'redo'), [run, redoStack])

  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      // One press, one step — a held key must not walk the whole stack.
      if (e.repeat || inEditableField(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); onUndo() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); onRedo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onUndo, onRedo, enabled])

  return {
    push, clear,
    onUndo, onRedo, histBusy, histNote,
    undoLabel: undoStack.length ? undoStack[undoStack.length - 1].label : '',
    redoLabel: redoStack.length ? redoStack[redoStack.length - 1].label : '',
  }
}
