/**
 * Scam Checker API — Cloudflare Worker
 *
 * Endpoints (all return JSON):
 *   POST /check   — body { url: "..." }  → full scan result (or SSE stream if Accept: text/event-stream)
 *   GET  /health  → { status, openPhish }
 *
 * The frontend (deployed to Pages) calls these endpoints directly with the
 * Worker URL configured via VITE_API_BASE_URL.
 */

import { checkReddit } from './checks/reddit.js'
import { checkGoogle } from './checks/google.js'
import { checkDomain } from './checks/domain.js'
import { checkSSL } from './checks/ssl.js'
import { checkReputation } from './checks/reputation.js'
import { checkDNS } from './checks/dns.js'
import { withTimeout } from './checks/_timeout.js'
import { refreshFeed, scheduled as openphishScheduled, getOpenPhishStatus } from './checks/openphish.js'
import { scoreScan, bandToOverall } from './scoring.js'

// CORS headers — the frontend on Pages calls this Worker cross-origin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
}

// Per-isolate cache. Workers isolates are long-lived, so this acts as a simple
// in-memory cache. On cold start it's empty. Workers KV would be the upgrade path
// if cross-isolate caching is needed (free tier: 100k reads/day).
const cache = new Map()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function extractDomain(input) {
  try {
    const url = input.startsWith('http') ? new URL(input) : new URL(`https://${input}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return input.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '').toLowerCase()
  }
}

// Unwrap withTimeout's { ok, value } envelope (or pass through plain values)
function unwrap(c, id) {
  if (!c) {
    console.error(`unwrap: result for ${id} is undefined/null`)
    return { id, status: 'error', error: 'Check returned no result' }
  }
  if (c.status === 'fulfilled') {
    const r = c.value
    if (r && typeof r === 'object' && 'ok' in r) {
      // withTimeout resolves to { ok: false, reason } on timeout — there is no
      // `value` key, so reading it blindly pushed `undefined` into the results.
      return r.ok ? r.value : { id, status: 'unknown', details: r.reason || 'Check timed out' }
    }
    return r
  }
  return { id, status: 'error', error: c.reason?.message || 'Check failed' }
}

const CORE_CHECKS = ['domain', 'ssl', 'dns', 'reputation']
const COMMUNITY_CHECKS = ['reddit', 'google']

async function runAllChecks(domain, env) {
  const [reddit, google, domainInfo, ssl, reputation, dns] = await Promise.allSettled([
    withTimeout(checkReddit(domain, env), 4500, 'Reddit check timed out'),
    withTimeout(checkGoogle(domain, env), 3000, 'Google check timed out'),
    checkDomain(domain),
    checkSSL(domain),
    checkReputation(domain, env),
    checkDNS(domain),
  ])

  return [
    unwrap(reddit, 'reddit'),
    unwrap(google, 'google'),
    unwrap(domainInfo, 'domain'),
    unwrap(ssl, 'ssl'),
    unwrap(reputation, 'reputation'),
    unwrap(dns, 'dns'),
  ]
}

async function runCoreChecks(domain, env) {
  const [domainInfo, ssl, dns, reputation] = await Promise.allSettled([
    withTimeout(checkDomain(domain), 2500, 'domain check timed out'),
    // 4000ms so this does not undercut checkSSL's own 3000/3500ms internal
    // budget — at 2500 the CT-log lookup could never complete. Checks run in
    // parallel, so this raises the core stage ceiling, not its sum.
    withTimeout(checkSSL(domain), 4000, 'ssl check timed out'),
    withTimeout(checkDNS(domain), 2500, 'dns check timed out'),
    withTimeout(checkReputation(domain, env), 2500, 'reputation check timed out'),
  ])

  return [
    unwrap(domainInfo, 'domain'),
    unwrap(ssl, 'ssl'),
    unwrap(dns, 'dns'),
    unwrap(reputation, 'reputation'),
  ]
}

async function runCommunityChecks(domain, env) {
  const [reddit, google] = await Promise.allSettled([
    withTimeout(checkReddit(domain, env), 4500, 'Reddit check timed out'),
    withTimeout(checkGoogle(domain, env), 3000, 'Google check timed out'),
  ])

  return [
    unwrap(reddit, 'reddit'),
    unwrap(google, 'google'),
  ]
}

function buildResponse(domain, url, checks, opts = {}) {
  const trust = scoreScan(checks)
  return {
    domain,
    url: url.startsWith('http') ? url : `https://${domain}`,
    // Derived from the scored band, not max-severity. Previously a single
    // dangerous check (a missing A record, a crt.sh outage) painted the whole
    // verdict red while the score said 79.
    overall: bandToOverall(trust.band),
    trust,
    timestamp: new Date().toISOString(),
    checks,
    complete: opts.complete !== false,
    ...(opts.partial ? { partial: true } : {}),
  }
}

async function handleCheck(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  const { url } = body
  if (!url || typeof url !== 'string') {
    return jsonResponse({ error: 'URL is required' }, 400)
  }

  const domain = extractDomain(url.trim())
  const cacheKey = `check:${domain}`
  const cached = cache.get(cacheKey)
  const acceptSSE = (request.headers.get('accept') || '').includes('text/event-stream')

  // Cache hits are only served as JSON. SSE clients always run fresh so they
  // get streaming events (the XHR on the frontend reads SSE format incrementally).
  if (cached && Date.now() - cached._ts < CACHE_TTL_MS && !acceptSSE) {
    return jsonResponse({ ...cached.response, cached: true })
  }

  // ── Non-staggered: single-shot JSON ──
  if (!acceptSSE) {
    try {
      const checks = await runAllChecks(domain, env)
      const response = buildResponse(domain, url, checks)
      cache.set(cacheKey, { _ts: Date.now(), response })
      return jsonResponse(response)
    } catch (err) {
      console.error('Check error:', err)
      return jsonResponse({ error: 'Internal server error' }, 500)
    }
  }

  // ── Staggered SSE path ──
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const send = async (event, data) => {
    await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  }

  // Run in background — return the readable side immediately
  ;(async () => {
    try {
      await send('start', {
        domain,
        url: url.startsWith('http') ? url : `https://${domain}`,
        timestamp: new Date().toISOString(),
      })

      const core = await runCoreChecks(domain, env)
      const interim = buildResponse(domain, url, core, { partial: true, complete: false })
      await send('core', interim)

      const community = await runCommunityChecks(domain, env)
      const allChecks = [...core, ...community]
      const final = buildResponse(domain, url, allChecks, { complete: true })
      cache.set(cacheKey, { _ts: Date.now(), response: final })
      await send('done', final)
    } catch (err) {
      console.error('SSE error:', err)
      try {
        await send('error', { error: err.message || 'Internal error' })
      } catch {}
    } finally {
      try { await writer.close() } catch {}
    }
  })()

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
    },
  })
}

export default {
  async fetch(request, env, ctx) {
    // Trigger an OpenPhish refresh on first request to a cold isolate
    // (fire-and-forget). Cron Trigger handles warm keeps.
    ctx.waitUntil(refreshFeed())

    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      // Await the refresh before reading status. Reading it synchronously after
      // a fire-and-forget waitUntil reported entries:0 on any cold isolate.
      await refreshFeed()
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString(), openPhish: getOpenPhishStatus() })
    }

    // Main check endpoint — accept both /check and /api/check for compatibility
    if ((url.pathname === '/check' || url.pathname === '/api/check') && request.method === 'POST') {
      return handleCheck(request, env)
    }

    // Root — informational
    if (url.pathname === '/' || url.pathname === '/api') {
      return jsonResponse({
        service: 'scam-checker-api',
        endpoints: ['POST /api/check { url }', 'GET /api/health'],
        timestamp: new Date().toISOString(),
      })
    }

    return jsonResponse({ error: 'Not found' }, 404)
  },

  async scheduled(event, env, ctx) {
    // Wire up the OpenPhish scheduled refresh
    return openphishScheduled(event, env, ctx)
  },
}