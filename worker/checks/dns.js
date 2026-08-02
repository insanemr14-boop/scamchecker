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
    const answers = data.Answer || []
    // Carry the DNSSEC-validated flag alongside the answers; it lives at the
    // top level of the response and was previously dropped.
    if (data.AD) Object.defineProperty(answers, 'ad', { value: true, enumerable: false })
    return answers
  } catch {
    return []
  }
}

export async function checkDNS(domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()

    // 7 parallel queries, each with a 1.5s deadline. Total wait bounded by ~1.5s.
    // DMARC lives at the _dmarc subdomain, never at the apex, so it needs its
    // own query — searching the apex TXT answers for it always returns nothing.
    const [a, aaaa, mx, ns, txt, caa, dmarc] = await Promise.all([
      resolveOne(cleanDomain, 'A'),
      resolveOne(cleanDomain, 'AAAA'),
      resolveOne(cleanDomain, 'MX'),
      resolveOne(cleanDomain, 'NS'),
      resolveOne(cleanDomain, 'TXT'),
      resolveOne(cleanDomain, 'CAA'),
      resolveOne(`_dmarc.${cleanDomain}`, 'TXT')
    ])

    const details = {}
    const flags = []

    if (a.length > 0) {
      details.aRecords = a.map(r => r.data)
    } else {
      flags.push('No A (IPv4) DNS record found')
    }

    if (aaaa.length > 0) details.aaaaRecords = aaaa.map(r => r.data)
    // Informational only. Most legitimate sites are not mail domains, so a
    // missing MX is not a security signal — flagging it produced a false
    // positive on essentially every static/brochure site. Spoofing risk is
    // already covered by the SPF and DMARC checks below.
    if (mx.length > 0) {
      details.mxRecords = mx.map(r => r.data)
    } else {
      details.mxRecords = 'None (domain does not receive email)'
    }

    if (ns.length > 0) {
      details.nameServers = ns.map(r => r.data)
      if (ns.length < 2) flags.push('Less than 2 NameServers (poor redundancy)')
    } else {
      flags.push('No NS records found')
    }

    // SPF (apex TXT) and DMARC (_dmarc TXT) are evaluated independently — an
    // empty apex TXT set says nothing about whether DMARC is published.
    const hasSPF = txt.some(r => r.data.includes('v=spf1'))
    const dmarcRecord = dmarc.find(r => r.data.includes('v=DMARC1'))
    const hasDMARC = Boolean(dmarcRecord)
    // p=none is a monitoring-only policy and offers no actual protection;
    // quarantine/reject do. Worth distinguishing.
    const dmarcPolicy = dmarcRecord?.data.match(/[;\s]p\s*=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() || null

    details.spfConfigured = hasSPF ? 'Yes' : 'No'
    details.dmarcConfigured = hasDMARC ? 'Yes' : 'No'
    if (!hasSPF) flags.push('No SPF email protection record')
    if (!hasDMARC) flags.push('No DMARC email spoofing protection')

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
      evidence: {
        hasA: a.length > 0,
        hasAAAA: aaaa.length > 0,
        nsCount: ns.length,
        hasMX: mx.length > 0,
        hasSPF,
        hasDMARC,
        dmarcPolicy,
        hasCAA: caa.length > 0,
        dnssecAD: Boolean(a.ad),
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