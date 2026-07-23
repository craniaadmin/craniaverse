// Student portal login (username + password) — shared by the Students
// detail page's "Login" panel and the standalone Logins page. Both are
// deterministic functions of the student's name, not stored data, so
// there's nothing to save/sync: any surface can recompute the same
// username/password for a given student at any time.

export function usernameFor(firstName, lastName) {
  return firstName && lastName
    ? `${firstName.toLowerCase()}${lastName.toLowerCase()}`
    : ''
}

export function generatePassword(firstName, lastName) {
  const letter = (ch) => {
    const n = (ch.toUpperCase().charCodeAt(0) - 64)
    return n >= 1 && n <= 26 ? String(n).padStart(2, '0') : null
  }
  const first = letter((firstName || '')[0])
  const second = letter((lastName || '')[0])
  if (!first || !second) return null
  const suffix = first[0] === '0' ? '#' : first[0] === '1' ? '!' : '*'
  const name = (firstName || '').charAt(0).toUpperCase() + (firstName || '').slice(1).toLowerCase()
  return `${name}${first}${second}${suffix}`
}
