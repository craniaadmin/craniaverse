const o = window.fetch
window.fetch = (u, x) => String(u).includes('/api/')
  ? Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }), blob: () => Promise.resolve(new Blob(['%PDF'])) })
  : o(u, x)
