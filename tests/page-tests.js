// Headless Chromium tests for the v7 sidebar layout. Signs in
// once, then for every (section, sub) tuple: clicks the sidebar
// section, clicks the top-bar submenu pill, and verifies the page
// renders without uncaught console errors.

import { chromium } from 'playwright'
import { BASE_URL, PAGE_TIMEOUT_MS } from './config.js'
import { assert, runTest } from './framework.js'

// Mirrors src/data/mockData.js SUBMENUS — keep in sync there.
// Order within each section matches the client's mockup.
const NAV = [
  { section: 'Home',        subs: ['Dashboard', 'Calendar', 'To-Do', 'Checklists', 'Projects'] },
  { section: 'Programs',    subs: ['Programs', 'Class Lists', 'Contests', 'Assessments'] },
  { section: 'Customers',   subs: ['Customers', 'Emergency Contacts'] },
  { section: 'Students',    subs: ['Students', 'Attendance', 'Comments', 'Crania Cash', 'Logins'] },
  { section: 'Staff',       subs: ['Staff', 'Schedules', 'Keys'] },
  { section: 'Operations',  subs: ['Inventory', 'Crania Store', 'IT Accounts'] },
  { section: 'Financial',   subs: ['Tuition Schedules', 'Invoices', 'Receipts'] },
  { section: 'Marketing',   subs: ['Marketing', 'Calendar', 'Leads', 'Surveys'] },
  { section: 'Merchandise', subs: ['Merchandise'] },
  { section: 'Contacts',    subs: ['Contacts'] },
  { section: 'Forms',       subs: ['All Forms', 'Submissions', 'Templates', 'Form Builder'] },
  { section: 'Day School',  subs: ['Day School'] },
]

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

async function clickSidebar(page, label) {
  const btn = page.locator('nav.sidebar button.sidebar-item', { hasText: new RegExp(`^${escapeRe(label)}$`) })
  await btn.first().waitFor({ state: 'visible', timeout: 3000 })
  await btn.first().click({ timeout: 2000 })
}

async function clickSubmenu(page, label) {
  const btn = page.locator('header.topbar-v7 .submenu button', { hasText: new RegExp(`^${escapeRe(label)}$`) })
  await btn.first().waitFor({ state: 'visible', timeout: 3000 })
  await btn.first().click({ timeout: 2000 })
}

export async function runPageTests() {
  const results = []
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    const consoleErrors = []
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(`uncaught: ${e.message}`))

    // -------- Login screen renders --------
    results.push(await runTest('Login page renders', async () => {
      const resp = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS })
      assert(resp && resp.ok(), `HTTP ${resp?.status()}`)
      await page.getByRole('button', { name: /sign in/i }).waitFor({ timeout: 5000 })
    }))

    // -------- Sign in --------
    results.push(await runTest('Sign in succeeds', async () => {
      consoleErrors.length = 0
      const pw = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || ''
      assert(pw, 'ADMIN_PASSWORD (or TEST_ADMIN_PASSWORD) must be set in server/.env for page tests')
      const pwInput = page.locator('input[type="password"]').first()
      await pwInput.waitFor({ timeout: 5000 })
      await pwInput.fill(pw)
      await page.getByRole('button', { name: /sign in/i }).click()
      // After login, the sidebar renders with a "Home" button visible.
      await page.locator('nav.sidebar button.sidebar-item', { hasText: /^Home$/ })
        .first().waitFor({ timeout: 5000 })
      const errs = consoleErrors.filter(e => !isIgnorableError(e))
      assert(errs.length === 0, `console errors: ${errs.join(' | ')}`)
    }))

    // -------- Each page renders --------
    for (const { section, subs } of NAV) {
      // Open the section once; that auto-navigates to its first sub.
      results.push(await runTest(`Sidebar: ${section}`, async () => {
        consoleErrors.length = 0
        await clickSidebar(page, section)
        await page.locator('.page, .placeholder-v7').first().waitFor({ timeout: 5000 })
        const errs = consoleErrors.filter(e => !isIgnorableError(e))
        assert(errs.length === 0, `console errors: ${errs.join(' | ')}`)
      }))

      // Then walk every sub via the top-bar submenu pills.
      for (const sub of subs) {
        results.push(await runTest(`Nav: ${section} → ${sub}`, async () => {
          consoleErrors.length = 0
          await clickSubmenu(page, sub)
          await page.locator('.page, .placeholder-v7').first().waitFor({ timeout: 5000 })
          const errs = consoleErrors.filter(e => !isIgnorableError(e))
          assert(errs.length === 0, `console errors: ${errs.join(' | ')}`)
        }))
      }
    }
  } catch (err) {
    results.push({
      name: 'Page tests crashed before completion',
      passed: false,
      ms: 0,
      error: err?.message || String(err),
      stack: err?.stack || '',
    })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
  return results
}

// Some browser-extension or favicon errors are noise — ignore them.
function isIgnorableError(msg) {
  if (!msg) return true
  if (msg.includes('favicon')) return true
  if (msg.includes('Failed to load resource') && msg.includes('chrome-extension')) return true
  return false
}
