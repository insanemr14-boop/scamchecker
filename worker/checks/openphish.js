/**
 * OpenPhish community feed integration — Workers-compatible.
 *
 * OpenPhish publishes a free, keyless feed of confirmed phishing URLs at
 * https://openphish.com/feed.txt — ~300-600 URLs, refreshed every ~20 minutes.
 *
 * Strategy: download the feed into a module-level Set. Refresh is triggered by:
 *   1. A Cron Trigger (scheduled handler) every 20 minutes — keeps isolates warm.
 *   2. Lazy refresh on first lookup if the feed is stale (>20 min) — survives cold starts.
 *
 * Module-level state is per-isolate (Workers can run multiple isolates globally).
 * Acceptable trade-off: every isolate maintains its own copy.
 */

import { fastFetch } from './_timeout.js'

const FEED_URL = 'https://openphish.com/feed.txt'
const STALE_MS = 20 * 60 * 1000

let entries = new Set() // normalized host fragments: 'paypal-login', etc.
let lastFetched = 0
let inflight = null // in-flight refresh promise, so concurrent callers can await it
let lastError = null

/**
 * Platforms that hand out subdomains to unrelated third parties. A phishing
 * page at evil.pages.dev says nothing about pages.dev itself, so the parent
 * must never be indexed — otherwise one abusive subdomain poisons every
 * legitimate site on the platform (this app's own Pages domain included).
 * Not a full public suffix list; these are the hosts that actually recur in
 * phishing feeds.
 */
const SHARED_HOSTS = new Set([
  'pages.dev', 'workers.dev', 'r2.dev', 'github.io', 'netlify.app', 'vercel.app',
  'web.app', 'firebaseapp.com', 'appspot.com', 'azurewebsites.net', 'herokuapp.com',
  'weebly.com', 'wixsite.com', 'blogspot.com', 'wordpress.com', '000webhostapp.com',
  'glitch.me', 'repl.co', 'replit.app', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com',
  'surge.sh', 'neocities.org', 'square.site', 'myshopify.com', 'bigcartel.com',
  'sharepoint.com', 'onedrive.live.com', 'duckdns.org', 'dpdns.org', 'serveo.net',
])

function hostOf(urlOrHost) {
  let host
  try {
    host = urlOrHost.startsWith('http') ? new URL(urlOrHost).hostname : urlOrHost
  } catch {
    host = urlOrHost
  }
  return host.toLowerCase().split('/')[0]
}

/**
 * @param {string} urlOrHost
 * @param {boolean} forIndex  true when building the blocklist from the feed;
 *   false when looking a domain up. Indexing suppresses shared-host parents.
 */
function extractFragments(urlOrHost, forIndex = false) {
  const host = hostOf(urlOrHost)
  if (!host) return []

  const labels = host.split('.').filter(Boolean)
  if (labels.length < 2) return []
  if (/^\d+(\.\d+){3}$/.test(host)) return []

  const registrable = labels.slice(-2).join('.')
  const fragments = [host]

  // On a shared platform the exact host is the only meaningful unit of blame.
  if (forIndex && SHARED_HOSTS.has(registrable)) return fragments

  fragments.push(registrable)
  if (labels.length >= 3) fragments.push(labels.slice(-3).join('.'))
  return fragments
}

export async function refreshFeed() {
  // Already fresh — nothing to do. The fetch handler fires this on every
  // request, so without this guard each request re-downloaded the whole feed.
  if (entries.size > 0 && Date.now() - lastFetched < STALE_MS) return

  // Return the in-flight promise rather than undefined. Returning undefined let
  // a concurrent `await refreshFeed()` fall through instantly to an empty feed,
  // which reported "0 phishing URLs indexed" as a clean result on cold starts.
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const res = await fastFetch(FEED_URL, {}, { timeoutMs: 4000 })
      if (!res.ok) {
        lastError = `OpenPhish fetch status ${res.status}`
        return
      }
      const text = await res.text()
      const next = new Set()
      for (const line of text.split('\n')) {
        const url = line.trim()
        if (!url || url.startsWith('#')) continue
        for (const f of extractFragments(url, true)) next.add(f)
      }
      if (next.size > 0) {
        entries = next
        lastFetched = Date.now()
        lastError = null
      } else {
        // 200 with an empty/unparseable body — OpenPhish rate-limits callers.
        // Record it: silently keeping an empty set is what made a cold isolate
        // report "0 phishing URLs indexed" as though it were a clean result.
        lastError = 'OpenPhish feed returned no entries (possibly rate-limited)'
      }
    } catch (err) {
      lastError = err?.message || 'OpenPhish refresh failed'
      // keep previous entries on failure
    }
  })()

  try {
    await inflight
  } finally {
    inflight = null
  }
}

/**
 * Cron Trigger handler — called every 20 min by Cloudflare.
 * Keeps the isolate's feed warm across requests.
 */
export async function scheduled(event, env, ctx) {
  ctx.waitUntil(refreshFeed())
}

export function getOpenPhishStatus() {
  return {
    entries: entries.size,
    lastFetched,
    feed: FEED_URL,
    lastError,
    ageSeconds: lastFetched ? Math.floor((Date.now() - lastFetched) / 1000) : null,
  }
}

export async function checkOpenPhish(domainOrUrl) {
  // Lazy refresh on cold start or stale feed
  if (entries.size === 0 || Date.now() - lastFetched > STALE_MS) {
    await refreshFeed()
  }

  // An empty feed cannot clear anything. Report that as "unavailable" so the
  // caller does not present it as a clean result.
  if (entries.size === 0) {
    return { flagged: false, entriesLoaded: 0, feedAvailable: false, error: lastError }
  }

  // Same shared-host suppression on lookup: never attribute a phishing hit
  // across a platform boundary in either direction.
  const host = hostOf(domainOrUrl)
  const fragments = extractFragments(domainOrUrl, true)
  for (const f of fragments) {
    if (entries.has(f)) {
      return {
        flagged: true,
        match: f,
        matchKind: f === host ? 'exact-host' : 'registrable',
        entriesLoaded: entries.size,
        feedAvailable: true,
      }
    }
  }
  return { flagged: false, matchKind: null, entriesLoaded: entries.size, feedAvailable: true }
}