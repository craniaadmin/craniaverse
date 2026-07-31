// TEMPORARY harness shim. Delete with the harness.
window.__ctPut = []
const origFetch = window.fetch
window.__ctSeed = {
  extras: {
    p_34: { regDeadline: new Date(Date.now() + 86400e3).toISOString().slice(0, 10), status: 'Submitted', numOrdered: '12' },
    p_35: { regDeadline: new Date(Date.now() + 6 * 86400e3).toISOString().slice(0, 10), contestDate: '2027-02-24' },
    p_23: { regDeadline: '2020-01-15', status: 'Complete' },
  },
  manual: [{ id: 'manual-x1', org: 'ZZZ Manual Org', contest: 'A Manual Contest', regDeadline: '', contestDate: '2027-05-01', numOrdered: '3', status: 'Cancelled' }],
  hidden: [], hiddenCols: {}, colOrder: [],
}
window.fetch = (url, opts) => {
  if (String(url).includes('/api/contests')) {
    if (opts && opts.method === 'PUT') {
      window.__ctPut.push(JSON.parse(opts.body))
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(window.__ctSeed) })
  }
  return origFetch(url, opts)
}
