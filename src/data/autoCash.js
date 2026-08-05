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

/* Before triggers existed, two rules fired by name and nothing else could.
   A rule saved back then has no `when`, so it keeps exactly the behaviour
   it had; anything else becomes manual, which is what it already was.

   The server migrates on read too. This is here as well because the two
   deploy separately: a browser running the new bundle against an API that
   has not restarted yet would otherwise see no triggers on any rule and
   award nothing at all — worse than the bug being fixed. */
const LEGACY_TRIGGERS = {
  present: { field: 'attendance', value: 'P' },
  'no-shirt': { field: 'uniform', value: 'No' },
  'no shirt': { field: 'uniform', value: 'No' },
}

export function normaliseRule(r) {
  if (!r) return r
  if (r.when && r.when.field && r.when.value) return r
  if (r.when === null) return r          // explicitly set to manual — respect it
  const legacy = LEGACY_TRIGGERS[String(r.id || '').toLowerCase()]
    || LEGACY_TRIGGERS[String(r.reason || '').toLowerCase()]
  return legacy ? { ...r, when: legacy } : r
}

export const normaliseRules = (rules) => (rules || []).map(normaliseRule)

/* Rules carry their own trigger — `when: { field, value }` — so any rule
   can be automatic, not just the two that happened to be named right. A
   rule with no `when` is manual only: it shows as a quick-apply button and
   never fires by itself. */
export function awardsForRow(rules, row) {
  if (!row) return []
  return normaliseRules(rules)
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
  return normaliseRules(rules).some(r => r && r.when && r.when.field === field)
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

/* Rework a cash log so the automatic entries for ONE lesson are exactly the
   given awards — adding what is missing, withdrawing what no longer applies,
   and re-issuing any whose amount has changed. Pure, so the server route and
   its tests run the same code rather than two versions of it.

   Entries carrying no `auto` mark were added by hand and are never touched.

   Returns { log, delta } where delta is how much the balance must move. */
export function reconcileAutoCash(log, key, awards) {
  const existing = Array.isArray(log) ? log : []

  const want = new Map()
  for (const a of (awards || [])) {
    if (!a || !a.ruleId) continue
    const delta = Number(a.delta)
    if (!Number.isFinite(delta)) continue
    want.set(String(a.ruleId), { delta, reason: String(a.reason || '').trim() || 'Rule' })
  }

  const kept = []
  const have = new Set()
  for (const e of existing) {
    if (!e || !e.auto || e.auto.key !== key) { kept.push(e); continue }
    const ruleId = String(e.auto.ruleId || '')
    const target = want.get(ruleId)
    if (target && target.delta === e.delta) { kept.push(e); have.add(ruleId) }
  }

  const added = []
  for (const [ruleId, a] of want) {
    if (have.has(ruleId)) continue
    added.push({ ts: new Date().toISOString(), delta: a.delta, reason: a.reason, auto: { key, ruleId } })
  }

  const next = [...kept, ...added]
  const sum = (rows) => rows.reduce((n, e) => n + (Number(e && e.delta) || 0), 0)
  return {
    log: next,
    delta: sum(next) - sum(existing),
    added: added.length,
    removed: existing.length - kept.length,
    changed: added.length > 0 || kept.length !== existing.length,
  }
}

export const triggerLabel = (when) => {
  if (!when || !when.field || !when.value) return 'Manual only'
  const f = TRIGGER_FIELDS.find(x => x.key === when.field)
  if (!f) return 'Manual only'
  const v = f.values.find(x => x.v === when.value)
  return `${f.label} ${v ? v.label : when.value}`
}
