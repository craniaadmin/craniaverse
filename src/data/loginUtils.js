// Student portal login (username + password) — shared by the Students
// detail page's "Login" panel and the standalone Logins page.
//
// The generated values are deterministic functions of the student's name,
// so any surface can work them out without storing anything. That is
// convenient and it is also the whole problem: the password can be derived
// by anyone who knows the naming rule, it cannot be changed if it gets out,
// and two students with the same name get the same login.
//
// So a student may carry an override — student.loginUsername and
// student.loginPassword. When one is set it wins; when it is blank the
// generated value is used, which is what every existing student has. Read
// logins through resolveLogin() so the two never disagree.

export function usernameFor(firstName, lastName) {
  return firstName && lastName
    ? `${firstName.toLowerCase()}${lastName.toLowerCase()}`
    : ''
}

export function generatePassword(firstName, lastName) {
  /* A missing name gives no character at all — `''[0]` is undefined, and
     calling toUpperCase on it threw, which took down any page listing a
     student who had only one name. Returning null is what the callers
     already expect: no password can be generated. */
  const letter = (ch) => {
    if (!ch) return null
    const n = (String(ch).toUpperCase().charCodeAt(0) - 64)
    return n >= 1 && n <= 26 ? String(n).padStart(2, '0') : null
  }
  const first = letter((firstName || '')[0])
  const second = letter((lastName || '')[0])
  if (!first || !second) return null
  const suffix = first[0] === '0' ? '#' : first[0] === '1' ? '!' : '*'
  const name = (firstName || '').charAt(0).toUpperCase() + (firstName || '').slice(1).toLowerCase()
  return `${name}${first}${second}${suffix}`
}

/* What a student's login actually is, override or not.

   `custom` says the value was set by hand, which is what lets the UI show
   a "reset to generated" affordance only where there is something to
   reset — and lets the Logins page mark overridden rows so a changed
   password is never mistaken for the derived one. */
export function resolveLogin(student) {
  const s = student || {}
  const genUser = usernameFor(s.firstName, s.lastName)
  const genPass = generatePassword(s.firstName, s.lastName)
  const overUser = String(s.loginUsername || '').trim()
  const overPass = String(s.loginPassword || '').trim()
  return {
    username: overUser || genUser || '',
    password: overPass || genPass || '',
    generatedUsername: genUser || '',
    generatedPassword: genPass || '',
    customUsername: Boolean(overUser),
    customPassword: Boolean(overPass),
    custom: Boolean(overUser || overPass),
  }
}

/* Usernames must stay unique — they are what a student types to sign in.
   Two children called the same thing generate the same username, and an
   override can collide with anyone. Returns the ids sharing each clashing
   username so the page can point at them rather than just refusing. */
export function duplicateUsernames(records) {
  const by = new Map()
  for (const r of (records || [])) {
    if (!r || r.id === 'seed') continue
    const u = resolveLogin(r.student).username.toLowerCase()
    if (!u) continue
    if (!by.has(u)) by.set(u, [])
    by.get(u).push(r.id)
  }
  const out = new Map()
  for (const [u, ids] of by) if (ids.length > 1) out.set(u, ids)
  return out
}
