/**
 * Run an async function with a hard timeout. Resolves to an object describing
 * whether the call succeeded. When it does not, `reason` explains why.
 *
 *   const { ok, value, reason } = await withTimeout(slowCall(), 1500, 'fallback')
 *   if (!ok) { value is the timeout reason }
 */
export async function withTimeout(promise, ms, fallbackReason = 'Timed out') {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: fallbackReason }), ms)
  })
  try {
    const value = await Promise.race([promise.then((v) => ({ ok: true, value: v })), timeout])
    return value
  } finally {
    clearTimeout(timer)
  }
}

/**
 * fetch() wrapper that fails fast. Defaults: 2s connect, 3s total.
 */
export async function fastFetch(url, options = {}, { timeoutMs = 3000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}