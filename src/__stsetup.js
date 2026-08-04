const o = window.fetch
window.fetch = (u, x) => String(u).includes('/api/customers/backups')
  ? Promise.resolve({ ok:true, json:()=>Promise.resolve([
      { id:'b1', label:'4/08/2026, 9:00 am', created:'2026-08-04T09:00:00Z', count:9 }]) })
  : (String(u).includes('/api/') ? Promise.resolve({ ok:true, json:()=>Promise.resolve({ok:true}) }) : o(u,x))
