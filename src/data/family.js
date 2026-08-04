// Which registrations belong to the same family.
//
// Each student is their own registration, carrying a copy of the guardians'
// details, so siblings are only related by those details matching. The old
// rule was a single key — first name, last name and email glued together —
// and any difference at all split a family in two. Two students with the
// same parents ended up in separate blocks with separate family references
// because one record had the guardian's email and the other did not.
//
// So instead of one key per record, records are joined whenever they share
// any of several signals, and the joins are transitive: if A matches B on
// email and B matches C on name, all three are one family.
//
// Membership is decided by GUARDIAN 1 alone, on two signals:
//
//   1. The same guardian 1 email address. An address identifies a person.
//   2. The same guardian 1 name, where the emails do not contradict it. Two
//      "John Smith" records with different addresses are two families and
//      stay apart; a "John Smith" with an address and one without are the
//      same family.
//
// Two things are deliberately NOT used.
//
// Guardian 2, and email matching across the two slots. Pooling both slots
// merged two unrelated children whose records happened to share one address
// between different guardian fields.
//
// The stored family reference. It is an OUTPUT of this grouping, so feeding
// it back in as an input makes any bad grouping permanent: once a wrong
// merge has stamped one reference onto both records, that reference is then
// the evidence keeping them merged. Grouping is derived fresh from the
// guardians every time, and the references follow it.

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const fullName = (g) => norm(`${(g && g['First Name']) || ''} ${(g && g['Last Name']) || ''}`)
const emailOf = (g) => norm(g && g['Email'])

const guardianOne = (record) => (record.customer || {}).guardian1 || {}

/* Union-find. Small enough that the array form is plenty. */
function makeDisjointSet() {
  const parent = new Map()
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x)
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)
    // path compression, so repeated lookups stay cheap
    let c = x
    while (parent.get(c) !== r) { const next = parent.get(c); parent.set(c, r); c = next }
    return r
  }
  const union = (a, b) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  return { find, union }
}

/* Map of record id -> family key. The key is one member's id, chosen by the
   union-find; it is stable for a given set of records but carries no meaning
   of its own, so never show it or store it. */
export function buildFamilyIndex(records) {
  const list = (records || []).filter(r => r && r.id !== 'seed')
  const ds = makeDisjointSet()
  for (const r of list) ds.find(r.id)

  // 1 — the same guardian 1 email address.
  const byEmail = new Map()
  for (const r of list) {
    const e = emailOf(guardianOne(r))
    if (!e) continue
    if (byEmail.has(e)) ds.union(byEmail.get(e), r.id)
    else byEmail.set(e, r.id)
  }

  // 2 — the same guardian 1 name, where the addresses do not disagree.
  const buckets = new Map()
  for (const r of list) {
    const g = guardianOne(r)
    const name = fullName(g)
    if (!name) continue
    if (!buckets.has(name)) buckets.set(name, [])
    buckets.get(name).push({ id: r.id, email: emailOf(g) })
  }
  for (const members of buckets.values()) {
    const distinct = new Set(members.map(m => m.email).filter(Boolean))
    // More than one address under one name means more than one person.
    // Leave those to what the email pass already decided.
    if (distinct.size > 1) continue
    for (let i = 1; i < members.length; i++) ds.union(members[0].id, members[i].id)
  }

  const out = new Map()
  for (const r of list) out.set(r.id, ds.find(r.id))
  return out
}

/* The members of one record's family, the record itself included. */
export function familyOf(records, recordId, index) {
  const idx = index || buildFamilyIndex(records)
  const key = idx.get(recordId)
  if (!key) return (records || []).filter(r => r.id === recordId)
  return (records || []).filter(r => idx.get(r.id) === key)
}
