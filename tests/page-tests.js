// Headless Chromium tests. The app is a single-page React app with
// state-based routing (no URLs per page), so we sign in once then
// click each nav item and verify the page renders cleanly.

import { chromium } from 'playwright'
import { BASE_URL, PAGE_TIMEOUT_MS } from './config.js'
import { assert, runTest } from './framework.js'

// Nav label -> a heading or element we expect to find on that page.
// If the element doesn't appear within a few seconds, the test fails.
const PAGES = [
  { nav: 'Dashboard',         expect: 'h1, h2, .page-title' },
  { nav: 'Students',          expect: 'text=Students' },
  { nav: 'Customers',         expect: 'text=Customers' },
  { nav: 'Programs',          expect: 'text=Programs' },
  { nav: 'Payroll',           expect: 'text=Payroll' },
  { nav: 'Contests',          expect: 'text=Contests' },
  { nav: 'Inventory',         expect: 'text=Inventory' },
  { nav: 'Surveys',           expect: 'text=Surveys' },
  { nav: 'Crania Cash',       expect: 'text=Crania Cash' },
  { nav: 'Staff Hub',         expect: 'text=Staff Hub' },
  { nav: 'Staff Information', expect: 'text=Staff' },
  { nav: 'Fee Schedules',     expect: 'text=Fee' },
  { nav: 'To Do',             expect: '.page' },
  { nav: 'Calendar',          expect: '.page' },
]

// Try a couple of common selectors to find a nav item by its label.
// TopNav uses dropdowns under category headers; clicking the label
// works whether it's a top-level button or a dropdown item.
async function clickNav(page, label) {
  // Look for any clickable element whose visible text equals the label.
  // Use exact: true to avoid matching substrings (e.g. "Staff" hitting
  // "Staff Hub" first).
  const candidates = [
    page.getByRole('button',    { name: label, exact: true }),
    page.getByRole('menuitem',  { name: label, exact: true }),
    page.getByRole('link',      { name: label, exact: true }),
    page.getByText(label, { exact: true }),
  ]
  for (const loc of candidates) {
    const count = await loc.count().catch(() => 0)
    if (count > 0) {
      try {
        await loc.first().click({ timeout: 2000 })
        return true
      } catch {}
    }
  }
  return false
}

export async function runPageTests() {
  const results = []
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({
      // Give the React bundle time to load on slower machines
      navigationTimeout: PAGE_TIMEOUT_MS,
    })
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
      await page.getByRole('button', { name: /sign in/i }).click()
      // After login, the TopNav should render with at least one nav button
      await page.getByRole('button', { name: 'Dashboard' }).waitFor({ timeout: 5000 })
      assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
    }))

    // -------- Each page renders --------
    for (const { nav, expect } of PAGES) {
      results.push(await runTest(`Nav: ${nav}`, async () => {
        consoleErrors.length = 0
        const clicked = await clickNav(page, nav)
        assert(clicked, `couldn't find nav item "${nav}"`)
        // Give the route content a moment to mount, then check for the
        // expected selector (text or CSS).
        const sel = expect
        if (sel) {
          await page.locator(sel).first().waitFor({ timeout: 5000 })
        }
        const errs = consoleErrors.filter(e => !isIgnorableError(e))
        assert(errs.length === 0, `console errors: ${errs.join(' | ')}`)
      }))
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
