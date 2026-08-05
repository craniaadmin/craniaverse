// Which Crania Cash rules a lesson row earns, and how that is kept true.
//
// The old behaviour fired on a transition: set attendance to "P" and the
// code called addCashEntry once, there and then. Four things were wrong
// with that, and all of them are the same mistake — an award computed from
// an EVENT rather than from the STATE of the row:
//
//   · Marking P, then A, then P again awarded twice. Nothing looked to see
//     whether that lesson had already been paid for.
//   · Correcting P to A left the point awarded. Nothing took it back.
//   · Only the two hardcoded rules could ever fire, whatever you added on
//     the Rules screen.
//   · It only ran on the student's own page, so marking the register on the
//     Attendance page — the same field, the same stored row — awarded
//     nothing at all.
//
// So awards are derived, not fired. `awardsForRow` says what a row is worth
// right now; the server is told to make the log match that, adding what is
// missing and withdrawing what no longer applies. Doing it twice changes
// nothing, which is what makes it safe to call on every edit.

/* Rules carry their own trigger — `when: { field, value }` — so any rule
   can be automatic, not just the two that happened to be named right. A
   rule with no `when` is manual only: it shows as a quick-apply button and
   never fires by itself. */
export function awardsForRow(rules, row) {
  if (!row) return []
  return (rules || [])
    .filter(r => r && r.when && r.when.field && r.when.value)
    .filter(r => String(row[r.when.field] ?? '') === String(r.when.value))
    .map(r => ({ ruleId: r.id, delta: Number(r.delta) || 0, reason: r.reason || 'Rule' }))
}

/* Identifies one lesson so its awards can be reconciled later. Keyed on the
   lesson number rather than the array index where possible: inserting a
   lesson above shifts every index below it, which would strand the awards
   already given against the rows they belong to. */
export function rowKeyOf(tabKey, row, rowIdx) {
  const lesson = (row && row.lessonNo) || (rowIdx + 1)
  return `${tabKey}#${lesson}`
}

/* True when a change to this field could alter what a row earns — used to
   skip the round-trip on the many fields that never trigger anything. */
export function fieldCanTrigger(rules, field) {
  return (rules || []).some(r => r && r.when && r.when.field === field)
}

// The fields a rule can watch, and what each one can be set to. Kept here
// so the Rules editor and the pages agree on the vocabulary.
export const TRIGGER_FIELDS = [
  {
    key: 'attendance',
    label: 'Attendance is',
    values: [
      { v: 'P', label: 'P — Present' },
      { v: 'L', label: 'L — Late' },
      { v: 'A', label: 'A — Absent' },
      { v: 'E', label: 'E — Excused' },
    ],
  },
  {
    key: 'uniform',
    label: 'Uniform is',
    values: [
      { v: 'Yes', label: 'Yes' },
      { v: 'No', label: 'No' },
      { v: 'Borrowed', label: 'Borrowed' },
    ],
  },
]

export const triggerLabel = (when) => {
  if (!when || !when.field || !when.value) return 'Manual only'
  const f = TRIGGER_FIELDS.find(x => x.key === when.field)
  if (!f) return 'Manual only'
  const v = f.values.find(x => x.v === when.value)
  return `${f.label} ${v ? v.label : when.value}`
}
