// A 50-line testing framework. Each test is a name + async fn.
// runTest catches errors and returns a structured result so the
// runner can summarize without throwing.

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

export function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

export async function runTest(name, fn) {
  const start = Date.now()
  try {
    await fn()
    return { name, passed: true, ms: Date.now() - start }
  } catch (err) {
    return {
      name,
      passed: false,
      ms: Date.now() - start,
      error: err?.message || String(err),
      stack: err?.stack || '',
    }
  }
}

export function summarize(results) {
  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed
  return { total: results.length, passed, failed, results }
}
