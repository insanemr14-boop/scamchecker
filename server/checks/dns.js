import { fastFetch } from './_timeout.js'

/**
 * Single batched DNS query — fetches all record types in one round-trip
 * by abusing Google DoH's ability to handle a single question at a time
 * but firing them in parallel under a tight per-call deadline.
 * (Google DoH doesn't support true multi-question queries.)
 */
async function resolveOne(domain, type) {
  try {
    const res = await fastFetch(`https://dns.google/resolve?name=${domain}&type=${type}`, {
      headers: { 'Accept': 'application/json' }
    }, { timeoutMs: 1500 })
    if (!res.ok) return []
    const data = await res.json()
    return data.Answer || []
  } catch {
    return []
  }
}

export async function checkDNS(domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()

    // 6 parallel queries, each with a 1.5s deadline. Total wait bounded by ~1.5s.
    const [a, aaaa, mx, ns, txt, caa] = await Promise.all([
      resolveOne(cleanDomain, 'A'),
      resolveOne(cleanDomain, 'AAAA'),
      resolveOne(cleanDomain, 'MX'),
      resolveOne(cleanDomain, 'NS'),
      resolveOne(cleanDomain, 'TXT'),
      resolveOne(cleanDomain, 'CAA')
    ])

    const details = {}
    const flags = []

    if (a.length > 0) {
      details.aRecords = a.map(r => r.data)
    } else {
      flags.push('No A (IPv4) DNS record found')
    }

    if (aaaa.length > 0) details.aaaaRecords = aaaa.map(r => r.data)
    if (mx.length > 0) {
      details.mxRecords = mx.map(r => r.data)
    } else {
      flags.push('No MX records (no mail server set up)')
    }

    if (ns.length > 0) {
      details.nameServers = ns.map(r => r.data)
      if (ns.length < 2) flags.push('Less than 2 NameServers (poor redundancy)')
    } else {
      flags.push('No NS records found')
    }

    if (txt.length > 0) {
      const txtStrings = txt.map(r => r.data)
      const hasSPF = txtStrings.some(s => s.includes('v=spf1'))
      const hasDMARC = txtStrings.some(s => s.includes('v=DMARC1'))
      details.spfConfigured = hasSPF ? 'Yes' : 'No'
      details.dmarcConfigured = hasDMARC ? 'Yes' : 'No'
      if (!hasSPF) flags.push('No SPF email protection record')
      if (!hasDMARC) flags.push('No DMARC email spoofing protection')
    } else {
      flags.push('No SPF or DMARC email authentication records')
    }

    if (caa.length > 0) details.caaRecords = caa.map(r => r.data)
    else flags.push('No CAA record (Certificate Authority Restriction missing)')

    let status = 'safe'
    if (a.length === 0 && ns.length === 0) status = 'dangerous'
    else if (flags.length >= 3) status = 'warning'

    return {
      id: 'dns',
      name: 'DNS Records',
      icon: '🌐',
      color: '#06b6d4',
      desc: 'Analyze DNS records, SPF, DMARC, and email security',
      status,
      details: {
        ...details,
        securitySummary: flags.length === 0 ? 'All recommended DNS security records present' : `${flags.length} security flags detected`,
        securityFlags: flags
      },
      links: [
        { label: 'DNSViz Analysis', url: `https://dnsviz.net/d/${cleanDomain}/` },
        { label: 'MXToolbox Lookup', url: `https://mxtoolbox.com/SuperTool.aspx?action=mx%3a${cleanDomain}` },
        { label: 'SecurityHeaders Scan', url: `https://securityheaders.com/?q=${cleanDomain}` }
      ]
    }
  } catch (err) {
    return {
      id: 'dns',
      name: 'DNS Records',
      icon: '🌐',
      color: '#06b6d4',
      desc: 'Analyze DNS configuration and security records',
      status: 'error',
      error: err.message
    }
  }
}