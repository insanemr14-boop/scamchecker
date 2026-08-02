/**
 * OpenPhish community feed integration.
 *
 * OpenPhish publishes a free, keyless feed of confirmed phishing URLs at
 * https://openphish.com/feed.txt — ~300-600 URLs, refreshed every ~20 minutes.
 *
 * Strategy: download the feed once into memory, refresh in the background every
 * 20 minutes, and serve instant subdomain-aware matches against any queried
 * domain or URL.
 */

import { fastFetch } from './_timeout.js'

const FEED_URL = 'https://openphish.com/feed.txt'
const REFRESH_MS = 20 * 60 * 1000

let entries = new Set() // normalized host fragments: 'paypal-login', 'aktiffkan-paylater.tll.my.id', etc.
let lastFetched = 0
let refreshing = false

/**
 * Normalize a URL or domain into a list of "host fragments" we can match against.
 * We store the registrable host portion (the last 3 labels for typical cases).
 * For 'foo.bar.paypal-login.example.com' we want 'paypal-login' and 'example'
 * to match an attacker payload on 'paypal-login.example.com'.
 */
function extractFragments(urlOrHost) {
  let host
  try {
    host = urlOrHost.startsWith('http') ? new URL(urlOrHost).hostname : urlOrHost
  } catch {
    host = urlOrHost
  }
  host = host.toLowerCase().split('/')[0]
  if (!host) return []

  // Skip IP literals and short hostnames — they're not in the feed in useful form
  const labels = host.split('.').filter(Boolean)
  if (labels.length < 2) return []
  if (/^\d+(\.\d+){3}$/.test(host)) return []

  // Return the full host + the "registrable" last 2-3 labels (handles .co.uk etc simply)
  const fragments = [host]
  if (labels.length >= 2) fragments.push(labels.slice(-2).join('.'))
  if (labels.length >= 3) fragments.push(labels.slice(-3).join('.'))
  return fragments
}

async function refreshFeed() {
  if (refreshing) return
  refreshing = true
  try {
    const res = await fastFetch(FEED_URL, {}, { timeoutMs: 4000 })
    if (!res.ok) return
    const text = await res.text()
    const next = new Set()
    for (const line of text.split('\n')) {
      const url = line.trim()
      if (!url || url.startsWith('#')) continue
      for (const f of extractFragments(url)) next.add(f)
    }
    if (next.size > 0) {
      entries = next
      lastFetched = Date.now()
    }
  } catch {
    // keep previous entries on failure
  } finally {
    refreshing = false
  }
}

export function startOpenPhishFeed() {
  if (lastFetched) return // already started
  refreshFeed()
  setInterval(refreshFeed, REFRESH_MS).unref?.()
}

export function getOpenPhishStatus() {
  return { entries: entries.size, lastFetched, feed: FEED_URL }
}

/**
 * Check whether a domain (or URL) appears in the OpenPhish feed.
 * Returns the matching URL fragment and OpenPhish reference link if found.
 */
export async function checkOpenPhish(domainOrUrl) {
  if (entries.size === 0) await refreshFeed()

  const fragments = extractFragments(domainOrUrl)
  for (const f of fragments) {
    if (entries.has(f)) {
      return {
        flagged: true,
        match: f,
        entriesLoaded: entries.size,
      }
    }
  }
  return { flagged: false, entriesLoaded: entries.size }
}
