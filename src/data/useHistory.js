// Undo/redo for a page that keeps its data in one piece of state.
//
// Watches the value rather than asking every call site to announce
// itself. A page that already has `const [x, setX]` and a save function
// gets working history from one line, instead of a `record()` before
// each of its twenty mutations — which is why most pages ended up with
// the buttons greyed out.
//
//   const hist = useHistory(board, applyBoard)
//   <PageActions {...hist} />
//
// `apply` is whatever the page already uses to set state and persist.
// Undo calls it with the earlier value, so the change is saved the same
// way any other edit is.

import { useCallback, useEffect, useRef, useState } from 'react'

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/* Ctrl+Z inside a text box has to undo the typing. Without this the
   page-level shortcut fires while someone is mid-word and throws away
   the sentence they were writing. */
function inEditableField(el) {
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

export default function useHistory(value, apply, opts = {}) {
  const {
    label = 'change',      // what the tooltip calls one step
    coalesceMs = 700,      // a burst of edits is one step, not thirty
    max = 40,
    enabled = true,
  } = opts

  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [histNote, setHistNote] = useState('')

  const prev = useRef(clone(value))
  const settled = useRef(true)      // false while a burst is still running
  const timer = useRef(null)
  const replaying = useRef(false)   // suppress capture during undo/redo
  const ready = useRef(false)

  // Capture the value as it was before a change, once the change stops.
  useEffect(() => {
    if (!enabled) return undefined
    if (!ready.current) {           // first render is not an edit
      ready.current = true
      prev.current = clone(value)
      return undefined
    }
    if (replaying.current) { prev.current = clone(value); return undefined }
    if (same(prev.current, value)) return undefined

    const before = prev.current
    prev.current = clone(value)

    /* Only the first change in a burst pushes a snapshot, so typing a
       name is one undo step rather than one per keystroke. */
    if (settled.current) {
      settled.current = false
      setUndoStack(s => [...s.slice(-(max - 1)), before])
      setRedoStack([])
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { settled.current = true }, coalesceMs)
    return undefined
  }, [value, enabled, coalesceMs, max])

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!histNote) return undefined
    const t = setTimeout(() => setHistNote(''), 4000)
    return () => clearTimeout(t)
  }, [histNote])

  const step = useCallback((from, setFrom, setTo, word) => {
    if (!from.length) return
    const target = from[from.length - 1]
    replaying.current = true
    setFrom(s => s.slice(0, -1))
    setTo(s => [...s.slice(-(max - 1)), clone(value)])
    apply(clone(target))
    setHistNote(`${word} ${label}`)
    // Let the value settle before watching again.
    setTimeout(() => { replaying.current = false; settled.current = true }, 0)
  }, [value, apply, label, max])

  const onUndo = useCallback(
    () => step(undoStack, setUndoStack, setRedoStack, 'Undid'),
    [step, undoStack])
  const onRedo = useCallback(
    () => step(redoStack, setRedoStack, setUndoStack, 'Redid'),
    [step, redoStack])

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
    onUndo, onRedo,
    undoLabel: undoStack.length ? label : '',
    redoLabel: redoStack.length ? label : '',
    histBusy: false,
    histNote,
  }
}
