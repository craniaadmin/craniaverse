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
// The signals, strongest first:
//
//   1. The same stored family reference. Set by hand, so it is taken as
//      given — this is how you force two records together.
//   2. A shared guardian email address. An address identifies a person, so
//      this is safe on its own.
//   3. The same guardian name, but only where the emails do not contradict
//      it. Two "John Smith" records with different addresses are two
//      different families and stay apart; a "John Smith" with an address and
//      a "John Smith" without are the same one.

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const fullName = (g) => norm(`${(g && g['First Name']) || ''} ${(g && g['Last Name']) || ''}`)
const emailOf = (g) => norm(g && g['Email'])

function guardians(record) {
  const c = record.customer || {}
  return [c.guardian1 || {}, c.guardian2 || {}]
}

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

  // 1 — an explicit family reference wins over anything derived.
  const byRef = new Map()
  for (const r of list) {
    const ref = norm(r.customer?.meta?.familyId)
    if (!ref) continue
    if (byRef.has(ref)) ds.union(byRef.get(ref), r.id)
    else byRef.set(ref, r.id)
  }

  // 2 — a shared email address, from either guardian slot.
  const byEmail = new Map()
  for (const r of list) {
    for (const g of guardians(r)) {
      const e = emailOf(g)
      if (!e) continue
      if (byEmail.has(e)) ds.union(byEmail.get(e), r.id)
      else byEmail.set(e, r.id)
    }
  }

  /* 3 — the same guardian name, where the addresses do not disagree. Each
     slot is bucketed separately, so a parent recorded as guardian 2 on one
     registration and guardian 1 on another still finds their match. */
  for (const slot of [0, 1]) {
    const buckets = new Map()
    for (const r of list) {
      const g = guardians(r)[slot]
      const name = fullName(g)
      if (!name) continue
      if (!buckets.has(name)) buckets.set(name, [])
      buckets.get(name).push({ id: r.id, email: emailOf(g) })
    }
    for (const members of buckets.values()) {
      const distinct = new Set(members.map(m => m.email).filter(Boolean))
      // More than one address under one name means more than one person.
      // Leave them to whatever the email pass already decided.
      if (distinct.size > 1) continue
      for (let i = 1; i < members.length; i++) ds.union(members[0].id, members[i].id)
    }
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
