// Working out what KIND of programme a registration names, and what colour
// to tint it. Shared by Customers and Students so a class is the same colour
// wherever you meet it.
//
// Registrations name their programme as free text and it rarely matches the
// catalogue character for character — "Private Piano — 30 min" against
// "PRIVATE PIANO LESSONS - 30 MIN", em-dash against hyphen, title case
// against caps. Exact matching left almost everything uncategorised and so
// untinted, which is why the column looked colourless.

export const DEFAULT_CAT_COLOR = '#F1F3F4'

export const TINTS = ['#A6E2F9', '#DEF2DE', '#FBF3CE', '#FBDDE4', '#E7DEF5',
  '#BEEBE8', '#FCE6D2', '#E8F3C2', '#CAD6F2', '#E2CDA0']

export const squash = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const words = (s) =>
  String(s || '').toUpperCase().split(/[^A-Z0-9]+/).filter(t => t.length > 2)

/* Readable ink for a chosen background. The palette runs from white to
   #2E2516, so one fixed colour would vanish at one end or the other. */
export function inkOn(bg) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(bg || '').trim())
  if (!m) return '#2E2516'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  // Rec. 601 luma — good enough to choose between two inks.
  return (0.299 * r + 0.587 * g + 0.114 * b) > 145 ? '#2E2516' : '#FFFFFF'
}

/* Colours assigned by position in a sorted list, not by hashing the name:
   hashing put two pairs of categories on the same colour while three
   palette entries went unused. Sorting keeps a category's colour stable as
   others are added. */
export function autoTints(categories) {
  const names = [...new Set((categories || []).filter(Boolean))].sort()
  const m = new Map()
  names.forEach((c, i) => m.set(c, TINTS[i % TINTS.length]))
  return m
}

/* Every category ships with the same grey, so out of the box one pill is
   indistinguishable from another and the colour tells you nothing. A
   category with no colour of its own — or still on that grey — falls back
   to its automatic one. An explicit choice always wins. */
export const makeTintFor = (catColors, auto) => (cat) => {
  if (!cat) return DEFAULT_CAT_COLOR
  const set = catColors && catColors[cat]
  if (set && String(set).toUpperCase() !== DEFAULT_CAT_COLOR) return set
  return auto.get(cat) || DEFAULT_CAT_COLOR
}

/* Look-ups for one catalogue: name -> programme, and name -> category.

   `categoryOf` tries, in order: the catalogue ignoring punctuation and
   case; then the category named at the front of the programme's own name,
   since the categories are named after the programmes ("FLEX", "SUMMER
   CAMP", "TEKNOKIDS CODING"); then anywhere in it; then shared words, which
   is what catches "Private Piano — 30 min" for "PRIVATE PIANO LESSONS" when
   neither string contains the other. */
export function buildCategoryLookup(programs, programsState) {
  const list = programs || []
  const catColors = (programsState && programsState.catColors) || {}

  const byName = new Map()
  const bySquashed = new Map()
  for (const p of list) {
    if (!p || !p.name) continue
    byName.set(String(p.name).trim().toUpperCase(), p)
    bySquashed.set(squash(p.name), p)
  }

  const names = new Set([
    ...Object.keys(catColors),
    ...((programsState && programsState.categoryOrder) || []),
    ...list.map(p => p && p.category).filter(Boolean),
  ])
  // Longest first so "TEKNOKIDS CODING" wins over a shorter overlap.
  const knownCategories = [...names]
    .map(c => ({ cat: c, key: squash(c), words: words(c) }))
    .filter(x => x.key)
    .sort((a, b) => b.key.length - a.key.length)

  const progFor = (name) =>
    byName.get(String(name || '').trim().toUpperCase()) || bySquashed.get(squash(name)) || null

  const categoryOf = (name) => {
    const k = squash(name)
    if (!k) return ''
    const hit = bySquashed.get(k)
    if (hit && hit.category) return hit.category
    for (const { cat, key } of knownCategories) if (k.startsWith(key)) return cat
    for (const { cat, key } of knownCategories) if (k.includes(key)) return cat
    // Two words in common is enough; a one-word category would already have
    // been caught by the containment passes above.
    const w = words(name)
    let best = null
    for (const c of knownCategories) {
      const shared = c.words.filter(x => w.includes(x)).length
      if (shared >= 2 && shared > ((best && best.shared) || 0)) best = { cat: c.cat, shared }
    }
    return best ? best.cat : ''
  }

  const tintFor = makeTintFor(catColors, autoTints(knownCategories.map(c => c.cat)))

  return { progFor, categoryOf, tintFor, knownCategories, catColors }
}

/* The categories actually in use across a set of registrations, commonest
   first — a colour picker listing every category in the catalogue would
   mostly be noise. */
export function usedCategories(records, categoryOf) {
  const counts = new Map()
  for (const r of (records || [])) {
    if (!r || r.id === 'seed') continue
    for (const p of (r.programs || [])) {
      const cat = categoryOf(p && p.program)
      if (!cat) continue
      counts.set(cat, (counts.get(cat) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cat, n]) => ({ cat, n }))
}
