/**
 * WHOIS / domain-age lookup via who-dat.as93.net (community-maintained RDAP/WHOIS
 * aggregator). No API key required. Returns registration date, registrar, nameservers,
 * DNSSEC status, and more in a single round-trip (~200-500ms).
 *
 * Falls back to rdap.org when who-dat is unavailable, then to legacy whois-json.
 */

import { fastFetch, withTimeout } from './_timeout.js'

export async function lookupWhois(cleanDomain) {
  const whoDatUrl = `https://who-dat.as93.net/${encodeURIComponent(cleanDomain)}`

  // ── 1. who-dat.as93.net (~250ms typical, no key) ──
  try {
    const { ok, value } = await withTimeout(
      fastFetch(whoDatUrl, { headers: { 'Accept': 'application/json' } }, { timeoutMs: 2500 }),
      3000,
      'who-dat lookup timed out'
    )
    if (ok && value?.ok) {
      const data = await value.json()
      const created = data.dates?.created
      if (created) {
        return {
          createdDate: created,
          expiresDate: data.dates?.expires || null,
          registrar: data.registrar?.name || 'Unknown',
          source: 'who-dat.as93.net',
        }
      }
    }
  } catch {
    // fall through
  }

  // ── 2. RDAP.org fallback (~500ms) ──
  try {
    const { ok, value } = await withTimeout(
      fastFetch(`https://rdap.org/domain/${cleanDomain}`, {
        headers: { 'Accept': 'application/json' },
      }, { timeoutMs: 2500 }),
      3000,
      'RDAP lookup timed out'
    )
    if (ok && value?.ok) {
      const data = await value.json()
      const events = data.events || []
      const regEvent = events.find((e) =>
        ['registration', 'created', 'creation'].includes(e.eventAction?.toLowerCase())
      )
      const expEvent = events.find((e) =>
        ['expiration', 'expires', 'expiry'].includes(e.eventAction?.toLowerCase())
      )
      let registrar = 'Unknown'
      if (Array.isArray(data.entities)) {
        const ent = data.entities.find((e) => (e.roles || []).includes('registrar'))
        const fn = ent?.vcardArray?.[1]?.find((v) => v[0] === 'fn')
        if (fn) registrar = fn[3]
      }
      if (regEvent?.eventDate) {
        return {
          createdDate: regEvent.eventDate,
          expiresDate: expEvent?.eventDate || null,
          registrar,
          source: 'rdap.org',
        }
      }
    }
  } catch {
    // fall through
  }

  // ── 3. Legacy whois-json (last resort, slow) ──
  try {
    const whoisMod = (await import('whois-json')).default
    const data = await withTimeout(whoisMod(cleanDomain), 3500, 'WHOIS timed out')
    if (data?.ok && data.value && (data.value.createdDate || data.value.creationDate)) {
      const v = data.value
      return {
        createdDate: v.createdDate || v.creationDate || v.created,
        expiresDate: v.expiresDate || v.expirationDate || v.expires,
        registrar: v.registrar || 'Unknown',
        source: 'whois-json',
      }
    }
  } catch {
    // fall through
  }

  return null
}
