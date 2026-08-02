import { fastFetch } from './_timeout.js'
import { checkOpenPhish, getOpenPhishStatus } from './openphish.js'

const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY // optional — only used if present

/**
 * Check a domain or URL against Cloudflare's threat-intelligence gateway.
 * Resolves the domain through security.cloudflare-dns.com and inspects the answer.
 * A response of 0.0.0.0 / 127.0.0.1 / Status 3 means Cloudflare blocked the host.
 * No API key needed.
 */
async function checkCloudflareSecurityDNS(domain) {
  try {
    const res = await fastFetch(`https://security.cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
      headers: { 'Accept': 'application/dns-json' }
    }, { timeoutMs: 1500 })
    if (!res.ok) return { name: 'Cloudflare Malware Guard', checked: false }
    const data = await res.json()
    const isBlocked = data.Status === 3 || (data.Answer && data.Answer.some((a) => a.data === '0.0.0.0' || a.data === '127.0.0.1'))
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

/**
 * Same idea but using Quad9's security-aware resolver. No API key.
 */
async function checkQuad9DNS(domain) {
  try {
    const res = await fastFetch(`https://dns.quad9.net/dns-query?name=${domain}&type=A`, {
      headers: { 'Accept': 'application/dns-json' }
    }, { timeoutMs: 1500 })
    if (!res.ok) return { name: 'Quad9 Threat Engine', checked: false }
    const data = await res.json()
    const isBlocked = data.Status === 3 || (data.Answer && data.Answer.some((a) => a.data === '0.0.0.0' || a.data === '127.0.0.1'))
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

/**
 * VirusTotal is only used when a key is present in env. Free tier: 4 req/min,
 * 500 req/day. Set VIRUSTOTAL_API_KEY in .env to enable.
 */
async function checkVirusTotal(domain) {
  if (!VIRUSTOTAL_API_KEY) return { name: 'VirusTotal', checked: false }
  try {
    const res = await fastFetch(`https://www.virustotal.com/api/v3/domains/${domain}`, {
      headers: { 'x-apikey': VIRUSTOTAL_API_KEY }
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
      details: `${malicious} malicious, ${suspicious} suspicious out of ${total} engines`
    }
  } catch {
    return { name: 'VirusTotal', checked: false }
  }
}

export async function checkReputation(domain) {
  try {
    // OpenPhish is an O(1) in-memory check — run alongside the network calls
    const [openPhish, ...networkChecks] = await Promise.all([
      checkOpenPhish(domain),
      checkCloudflareSecurityDNS(domain),
      checkQuad9DNS(domain),
      checkVirusTotal(domain),
    ])

    const activeChecks = networkChecks.filter((c) => c.checked)
    const flagged = activeChecks.filter((c) => !c.clean)

    const openPhishResult = {
      name: 'OpenPhish Community Feed',
      checked: true,
      clean: !openPhish.flagged,
      details: openPhish.flagged
        ? `Listed in OpenPhish phishing feed (matched: ${openPhish.match})`
        : `Clean (${openPhish.entriesLoaded} active phishing URLs indexed)`
    }
    if (openPhish.flagged) flagged.push(openPhishResult)

    let status = 'safe'
    if (flagged.length > 0) status = 'dangerous'
    else if (networkChecks.filter((c) => c.checked).length === 0) status = 'unknown'

    return {
      id: 'reputation',
      name: 'Reputation DBs',
      icon: '🛡️',
      color: '#f59e0b',
      desc: 'Check OpenPhish, Cloudflare, Quad9, VirusTotal & Phish DBs',
      status,
      details: {
        databasesChecked: activeChecks.length + 1,
        threatsDetected: flagged.length,
        results: [...activeChecks, openPhishResult],
        openPhishFeed: getOpenPhishStatus(),
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
