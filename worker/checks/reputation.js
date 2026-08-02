import { fastFetch } from './_timeout.js'
import { checkOpenPhish, getOpenPhishStatus } from './openphish.js'

// VIRUSTOTAL_API_KEY — set via `wrangler secret put VIRUSTOTAL_API_KEY` (optional).
// We accept the key from `env.VIRUSTOTAL_API_KEY` (Workers env binding).

const SINKHOLE_IPS = new Set(['0.0.0.0', '127.0.0.1', '::'])

const isSinkholed = (data) =>
  Array.isArray(data.Answer) && data.Answer.some((a) => SINKHOLE_IPS.has(a.data))

/**
 * Does the domain exist at all, according to a resolver that does no filtering?
 * Needed to tell "this resolver is blocking the domain" apart from "this domain
 * does not exist" — both can surface as NXDOMAIN.
 */
async function resolvesOnNeutralResolver(domain) {
  try {
    const res = await fastFetch(`https://dns.google/resolve?name=${domain}&type=A`, {}, { timeoutMs: 1500 })
    if (!res.ok) return null // unknown — caller must not infer a block
    const data = await res.json()
    return Array.isArray(data.Answer) && data.Answer.length > 0
  } catch {
    return null
  }
}

async function checkCloudflareSecurityDNS(domain, neutralPromise) {
  try {
    const res = await fastFetch(`https://security.cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
      headers: { 'Accept': 'application/dns-json' }
    }, { timeoutMs: 1500 })
    if (!res.ok) return { name: 'Cloudflare Malware Guard', checked: false }
    const data = await res.json()
    // Verified empirically: Cloudflare signals a block with Status 0 + an
    // 0.0.0.0 answer. Status 3 (NXDOMAIN) from this resolver means the domain
    // simply does not exist — treating it as a block reported every typo'd
    // domain as "flagged as malicious".
    const isBlocked = isSinkholed(data)
    return {
      name: 'Cloudflare Malware Guard',
      checked: true,
      clean: !isBlocked,
      details: isBlocked ? 'Flagged as malicious by Cloudflare Threat Intelligence' : 'Clean (Passed Cloudflare Security filters)'
    }
  } catch {
    return { name: 'Cloudflare Malware Guard', checked: false }
  }
}

async function checkQuad9DNS(domain, neutralPromise) {
  try {
    const res = await fastFetch(`https://dns.quad9.net/dns-query?name=${domain}&type=A`, {
      headers: { 'Accept': 'application/dns-json' }
    }, { timeoutMs: 1500 })
    if (!res.ok) return { name: 'Quad9 Threat Engine', checked: false }
    const data = await res.json()
    // Quad9 does sinkhole via NXDOMAIN, so Status 3 is only meaningful as a
    // block when a neutral resolver confirms the domain actually exists.
    const existsElsewhere = await neutralPromise
    const isBlocked = isSinkholed(data) || (data.Status === 3 && existsElsewhere === true)
    return {
      name: 'Quad9 Threat Engine',
      checked: true,
      clean: !isBlocked,
      details: isBlocked ? 'Blocked by Quad9 Threat Intelligence' : 'Clean (No threat detected on Quad9)'
    }
  } catch {
    return { name: 'Quad9 Threat Engine', checked: false }
  }
}

async function checkVirusTotal(domain, apiKey) {
  if (!apiKey) return { name: 'VirusTotal', checked: false }
  try {
    const res = await fastFetch(`https://www.virustotal.com/api/v3/domains/${domain}`, {
      headers: { 'x-apikey': apiKey }
    }, { timeoutMs: 1500 })
    if (!res.ok) return { name: 'VirusTotal', checked: false }
    const data = await res.json()
    const stats = data.data?.attributes?.last_analysis_stats || {}
    const malicious = stats.malicious || 0
    const suspicious = stats.suspicious || 0
    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    return {
      name: 'VirusTotal',
      checked: true,
      clean: malicious === 0 && suspicious === 0,
      details: `${malicious} malicious, ${suspicious} suspicious out of ${total} engines`,
      // Raw counts for the scorer — 1 engine and 6 engines are very different.
      counts: { malicious, suspicious, total },
    }
  } catch {
    return { name: 'VirusTotal', checked: false }
  }
}

export async function checkReputation(domain, env) {
  try {
    const vtKey = env?.VIRUSTOTAL_API_KEY || null
    // Shared so both filtering resolvers can distinguish a block from a
    // domain that simply does not exist, without paying for two lookups.
    const neutralPromise = resolvesOnNeutralResolver(domain)
    const [openPhish, cfSec, quad9, vt] = await Promise.all([
      checkOpenPhish(domain),
      checkCloudflareSecurityDNS(domain, neutralPromise),
      checkQuad9DNS(domain, neutralPromise),
      checkVirusTotal(domain, vtKey),
    ])

    const networkChecks = [cfSec, quad9, vt]
    const activeChecks = networkChecks.filter((c) => c.checked)
    const flagged = activeChecks.filter((c) => !c.clean)

    // An unavailable feed is not a clean result — mark it unchecked so it is
    // excluded from the "databases checked" count instead of implying a pass.
    const openPhishResult = {
      name: 'OpenPhish Community Feed',
      checked: openPhish.feedAvailable !== false,
      clean: !openPhish.flagged,
      details: openPhish.feedAvailable === false
        ? `Feed unavailable — not checked${openPhish.error ? ` (${openPhish.error})` : ''}`
        : openPhish.flagged
          ? `Listed in OpenPhish phishing feed (matched: ${openPhish.match})`
          : `Clean (${openPhish.entriesLoaded} active phishing URLs indexed)`
    }
    if (openPhish.flagged) flagged.push(openPhishResult)

    let status = 'safe'
    if (flagged.length > 0) status = 'dangerous'
    else if (activeChecks.length === 0) status = 'unknown'

    return {
      id: 'reputation',
      name: 'Reputation DBs',
      icon: '🛡️',
      color: '#f59e0b',
      desc: 'Check OpenPhish, Cloudflare, Quad9, VirusTotal & Phish DBs',
      status,
      details: {
        // Was `activeChecks.length + 1`, which counted OpenPhish even when its
        // feed was unavailable and therefore never actually consulted.
        databasesChecked: activeChecks.length + (openPhishResult.checked ? 1 : 0),
        threatsDetected: flagged.length,
        results: [...activeChecks, openPhishResult],
        openPhishFeed: getOpenPhishStatus(),
      },
      evidence: {
        openPhish: {
          available: openPhish.feedAvailable !== false,
          flagged: Boolean(openPhish.flagged),
          matchKind: openPhish.matchKind ?? null,
        },
        cloudflare: { checked: cfSec.checked, blocked: cfSec.checked ? !cfSec.clean : false },
        quad9: { checked: quad9.checked, blocked: quad9.checked ? !quad9.clean : false },
        virusTotal: {
          checked: vt.checked,
          malicious: vt.counts?.malicious ?? 0,
          suspicious: vt.counts?.suspicious ?? 0,
          total: vt.counts?.total ?? 0,
        },
      },
      links: [
        { label: 'OpenPhish Lookup', url: 'https://openphish.com/' },
        { label: 'PhishTank Check', url: `https://phishtank.org/checkurl.php?url=${encodeURIComponent(`https://${domain}`)}` },
        { label: 'URLVoid Scan', url: `https://www.urlvoid.com/scan/${domain}/` },
        { label: 'VirusTotal Domain Report', url: `https://www.virustotal.com/gui/domain/${domain}` }
      ]
    }
  } catch (err) {
    return {
      id: 'reputation',
      name: 'Reputation DBs',
      icon: '🛡️',
      color: '#f59e0b',
      desc: 'Check reputation databases',
      status: 'error',
      error: err.message
    }
  }
}