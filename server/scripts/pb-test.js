// Standalone diagnostic — auth via the SDK and dump the actual error.
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import PocketBase from 'pocketbase'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const url = process.env.PB_URL
const email = process.env.PB_ADMIN_EMAIL
const password = process.env.PB_ADMIN_PASSWORD
console.log('URL:    ', url)
console.log('EMAIL:  ', JSON.stringify(email))
console.log('PASSLEN:', password?.length)

const pb = new PocketBase(url)

try {
  console.log('\nAttempting _superusers auth...')
  const r = await pb.collection('_superusers').authWithPassword(email, password)
  console.log('  ✓ auth OK, token starts with:', r.token?.slice(0, 24))
} catch (err) {
  console.log('  ✗ auth failed.')
  console.log('  status:', err?.status)
  console.log('  message:', err?.message)
  console.log('  response.data:', JSON.stringify(err?.response?.data || err?.data, null, 2))
  console.log('  originalError:', err?.originalError?.message)
  console.log('  url tried:', err?.url)
}

try {
  console.log('\nFetching registrations...')
  const list = await pb.collection('registrations').getFullList({ batch: 50 })
  console.log('  ✓ got', list.length, 'records')
} catch (err) {
  console.log('  ✗ fetch failed.')
  console.log('  status:', err?.status)
  console.log('  message:', err?.message)
  console.log('  response.data:', JSON.stringify(err?.response?.data || err?.data, null, 2))
}
