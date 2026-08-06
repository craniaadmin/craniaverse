// A place for anything holding a debounced write to say "I have
// something outstanding", so the session timeout can push it to the
// server before signing out.
//
// Registering is optional. Most editing in the app writes 400ms after
// the last keystroke and will have landed long before a 3-hour session
// runs out; this is for the writers with a longer delay, and for the
// case of someone typing at the moment it expires.

const flushers = new Set()

/* Returns its own unregister function, so a component can drop its
   entry on unmount without the registry needing to know about it. */
export function registerFlush(fn) {
  if (typeof fn !== 'function') return () => {}
  flushers.add(fn)
  return () => flushers.delete(fn)
}

/* One slow or broken writer must not stop the others from saving, so
   every flusher runs and failures are collected rather than thrown. */
export async function flushAll() {
  const results = await Promise.allSettled([...flushers].map(fn => fn()))
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length) {
    console.error(`[pendingSaves] ${failed.length} of ${results.length} could not be saved`,
      failed.map(f => f.reason))
  }
  return { total: results.length, failed: failed.length }
}

export function pendingCount() { return flushers.size }

// Test seam — the registry is module-wide state.
export function __clear() { flushers.clear() }
