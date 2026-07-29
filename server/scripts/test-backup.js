import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import PocketBase from 'pocketbase'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const pb = new PocketBase(process.env.PB_URL || 'http://127.0.0.1:8090')
pb.autoCancellation(false)

try {
  await pb.collection('_superusers').authWithPassword(
    process.env.PB_ADMIN_EMAIL,
    process.env.PB_ADMIN_PASSWORD,
  )
  console.log('auth ok')

  // Test 1a: list with no options
  try {
    const rows = await pb.collection('todo_backups').getFullList()
    console.log('list (no opts) ok, count:', rows.length)
  } catch (e) {
    console.error('list (no opts) FAILED:', e.status, e.message)
  }

  // Test 1b: list with sort
  try {
    const rows = await pb.collection('todo_backups').getFullList({ sort: '-created' })
    console.log('list (sort) ok, count:', rows.length)
  } catch (e) {
    console.error('list (sort) FAILED:', e.status, e.message)
  }

  // Test 1c: getList paginated
  try {
    const page = await pb.collection('todo_backups').getList(1, 50)
    console.log('getList ok, count:', page.totalItems)
  } catch (e) {
    console.error('getList FAILED:', e.status, e.message)
  }

  // Test 2: create minimal
  try {
    const r = await pb.collection('todo_backups').create({ label: 'test', payload: { test: true } })
    console.log('create ok, id:', r.id)
    await pb.collection('todo_backups').delete(r.id)
    console.log('delete ok')
  } catch (e) {
    console.error('create FAILED:', e.status, e.message, e.data, e.originalError?.message)
  }
} catch (e) {
  console.error('auth FAILED:', e.message)
}
