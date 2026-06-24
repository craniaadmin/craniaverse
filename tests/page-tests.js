// Headless Chromium tests. The app is a single-page React app with
// state-based routing (no URLs per page), so we sign in once then
// click each nav item and verify the page renders cleanly.
//
// TopNav uses categorized dropdowns. To reach a page, click its
// group label first; if the group has only one item, the click goes
// straight to the page.

import { chromium } from 'playwright'
import { BASE_URL, PAGE_TIMEOUT_MS } from './config.js'
import { assert, runTest } from './framework.js'

// Mirrors src/data/mockData.js NAV. If the prod nav changes, this
// list must change too — tests will fail loudly otherwise.
const PAGES = [
  { group: 'Admin',     item: 'Dashboard'         },
  { group: 'Admin',     item: 'Calendar'          },
  { group: 'Admin',     item: 'To Do'             },
  { group: 'Admin',     item: 'Schedules'         },
  { group: 'Customers', item: 'Customers'         },
  { group: 'Customers', item: 'Surveys'           },
  { group: 'Students',  item: 'Students'          }, // single-item group
  { group: 'Programs',  item: 'Programs'          }, // single-item group
  { group: 'Contests',  item: 'Contests'          }, // single-item group
  { group: 'Staff',     item: 'Staff Information' },
  { group: 'Staff',     item: 'Staff Hub'         },
  { group: 'Operations',item: 'Crania Cash'       },
  { group: 'Operations',item: 'Inventory'         },
  { group: 'Financial', item: 'Fee Schedules'     },
  { group: 'Financial', item: 'Payroll'           },
]

// Click a top-level nav group label. Opens the dropdown if there's
// one; if the group is single-item, this already navigates.
async function openGroup(page, label) {
  const btn = page.locator(`header.topbar nav.nav .nav-btn`, { hasText: new RegExp(`^${escapeRe(label)}\\s*$`) })
  const n = await btn.count().catch(() => 0)
  if (n === 0) return false
  await btn.first().click({ timeout: 2000 })
  return true
}

// Click an item inside an open dropdown (or a same-named single-item
// group). The dropdown <button>s contain only the item label.
async function clickDropdownItem(page, label) {
  const it = page.locator(`header.topbar .dropdown button`, { hasText: new RegExp(`^${escapeRe(label)}\\s*$`) })
  const n = await it.count().catch(() => 0)
  if (n === 0) return false
  await it.first().click({ timeout: 2000 })
  return true
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

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
      await page.getByRole('button', { name: /sign in/i }).click()
      // After login, TopNav renders with the "Admin" group button.
      await page.locator('header.topbar nav.nav .nav-btn', { hasText: /^Admin\s*$/ })
        .first().waitFor({ timeout: 5000 })
      const errs = consoleErrors.filter(e => !isIgnorableError(e))
      assert(errs.length === 0, `console errors: ${errs.join(' | ')}`)
    }))

    // -------- Each page renders --------
    for (const { group, item } of PAGES) {
      results.push(await runTest(`Nav: ${group} → ${item}`, async () => {
        consoleErrors.length = 0
        const opened = await openGroup(page, group)
        assert(opened, `nav group "${group}" not found`)

        // If the group label === item label (single-item group),
        // the click above already navigated. Otherwise, click the
        // dropdown item.
        if (group !== item) {
          const clicked = await clickDropdownItem(page, item)
          assert(clicked, `dropdown item "${item}" not found under "${group}"`)
        }

        // Verify the page shell renders. .page is the wrapper every
        // route component renders into.
        await page.locator('.page, .login-wrap').first().waitFor({ timeout: 5000 })

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
