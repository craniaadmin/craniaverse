// TEMPORARY harness shim. Delete with the harness.
window.__ctPut = []
const origFetch = window.fetch
window.__ctSeed = {
  extras: {
    p_34: { regDeadline: '2026-11-20', contestDate: '2027-02-24', numOrdered: '12', status: 'Submitted' },
    p_23: { org: 'A Very Long Organisation Name Indeed', contest: 'An Extremely Long Contest Title That Should Ellipsis' },
  },
  manual: [{ id: 'm1', org: 'ZZZ Manual Org', contest: 'A Manual Contest', regDeadline: '', contestDate: '2027-05-01', numOrdered: '3', status: 'Cancelled' }],
  hidden: [], hiddenCols: {}, colOrder: [],
}
window.fetch = (url, opts) => {
  if (String(url).includes('/api/contests')) {
    if (opts && opts.method === 'PUT') { window.__ctPut.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }) }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(window.__ctSeed) })
  }
  return origFetch(url, opts)
}
