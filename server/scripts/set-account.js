// ============================================================
// Change an account's email, password, name or level from the
// console.
// ------------------------------------------------------------
// The app can do all of this under the avatar, but not when the
// thing you need to fix is how you sign in — a forgotten admin
// password, or an address nobody can receive mail at. This is the
// way back in, and it runs where the database lives.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/set-account.js --list
//   node server/scripts/set-account.js --who old@x.ca --email new@x.ca
//   node server/scripts/set-account.js --who a@x.ca --password 'something long'
//   node server/scripts/set-account.js --who a@x.ca --role admin --name 'Ada'
//
// --who may be left out when there is exactly one admin account.
//
// Passwords shorter or weaker than the app allows are refused. Add
// --force to set one anyway: an admin standing at the console can
// make that call, but it should be a decision rather than an
// accident, and the reason is printed either way.
//
// Requires server/.env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// ============================================================
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

const { loadUsers, saveUsers } = await import('../pb.js')
const {
  ROLES, isRole, normaliseRole, normaliseEmail,
  hashPassword, passwordProblem, publicUser,
} = await import('../users.js')

// ---- arguments ----------------------------------------------
const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : (argv[i + 1] ?? '')
}
const has = (name) => argv.includes(`--${name}`)

const opts = {
  who: flag('who'),
  email: flag('email'),
  password: flag('password'),
  name: flag('name'),
  role: flag('role'),
  force: has('force'),
  list: has('list'),
}

/* Thrown rather than exiting on the spot: process.exit() while the
   PocketBase client still holds a keep-alive socket makes libuv print
   an assertion after the message, which looks like a crash on a script
   whose whole job is to reassure you it did the right thing. */
class Stop extends Error {}
const die = (msg) => { throw new Stop(msg) }

async function main() {
  const users = await loadUsers()
if (users.length === 0) {
  die('There are no accounts yet. Start the API once — it seeds the first\n'
    + 'admin from ADMIN_PASSWORD in server/.env — then run this again.')
}

if (opts.list || argv.length === 0) {
  console.log('\nAccounts:\n')
  for (const u of users) {
    const p = publicUser(u)
    console.log(`  ${p.email.padEnd(32)} ${p.role.padEnd(9)} ${p.active ? '' : '(inactive) '}${p.name}`)
  }
  console.log('\nPass --who <email> with --email / --password / --name / --role to change one.\n')
  process.exit(0)
}

// ---- pick the account ---------------------------------------
let target
if (opts.who) {
  const wanted = normaliseEmail(opts.who)
  target = users.find(u => normaliseEmail(u.email) === wanted)
  if (!target) die(`No account with the email "${opts.who}". Run with --list to see them.`)
} else {
  const admins = users.filter(u => normaliseRole(u.role) === 'admin')
  if (admins.length !== 1) {
    die(`There ${admins.length === 0 ? 'is no admin account' : `are ${admins.length} admin accounts`}, `
      + 'so I cannot guess which you mean.\nPass --who <email>.')
  }
  target = admins[0]
}

// ---- validate ------------------------------------------------
const before = publicUser(target)
const changes = []
const next = { ...target }

if (opts.email !== undefined) {
  const addr = normaliseEmail(opts.email)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) die(`"${opts.email}" is not a valid email address.`)
  const clash = users.find(u => u.id !== target.id && normaliseEmail(u.email) === addr)
  if (clash) die(`Another account already uses ${addr}.`)
  next.email = addr
  changes.push(`email    ${before.email}  ->  ${addr}`)
}

if (opts.name !== undefined) {
  next.name = String(opts.name).trim()
  changes.push(`name     ${before.name || '(none)'}  ->  ${next.name || '(none)'}`)
}

if (opts.role !== undefined) {
  if (!isRole(opts.role)) die(`Role must be one of: ${ROLES.join(', ')}`)
  /* Demoting the only admin leaves nobody who can hand the level back
     out from inside the app. This script could do it, but silently
     locking the app's own admin screen is not a helpful surprise. */
  const admins = users.filter(u => normaliseRole(u.role) === 'admin' && u.active !== false)
  if (admins.length === 1 && admins[0].id === target.id && normaliseRole(opts.role) !== 'admin') {
    die('That is the only admin account. Give someone else admin first, or nobody\n'
      + 'will be able to manage accounts from inside the app.')
  }
  next.role = normaliseRole(opts.role)
  changes.push(`level    ${before.role}  ->  ${next.role}`)
}

if (opts.password !== undefined) {
  if (!opts.password) die('--password needs a value. Quote it if it contains spaces or !.')
  const problem = passwordProblem(opts.password)
  if (problem && !opts.force) {
    die(`That password is refused: ${problem}\n\n`
      + `It is ${opts.password.length} characters. This account can reach every student\n`
      + 'record, staff SIN and backup in the system, over a public address, so it is\n'
      + 'worth more than a short one.\n\n'
      + 'Add --force to set it anyway.')
  }
  if (problem && opts.force) {
    console.warn(`\n  ! Weak password accepted because of --force: ${problem}`)
  }
  next.passwordHash = hashPassword(opts.password)
  changes.push('password (changed)')
}

if (changes.length === 0) {
  die('Nothing to change. Pass --email, --password, --name or --role.')
}

// ---- write ---------------------------------------------------
await saveUsers(users.map(u => (u.id === target.id ? next : u)))

console.log(`\nUpdated ${before.email}:\n`)
for (const c of changes) console.log(`  ${c}`)
console.log(`\nThey now sign in with:  ${next.email}`)
if (opts.password !== undefined) {
  console.log('Their password is the one you passed — it is not printed here,')
  console.log('and it cannot be read back out of the database.')
}
console.log('\nAnyone already signed in keeps their session until it expires (3 hours).')
console.log('Restart the API to end those now:  pm2 restart craniaverse-api\n')
