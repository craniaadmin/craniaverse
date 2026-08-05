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
