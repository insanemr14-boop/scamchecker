import { lookupWhois } from './whois.js'

function scoreDomain(ageDays) {
  if (ageDays < 30) return { status: 'dangerous', riskLevel: 'VERY HIGH (Registered < 30 days ago)' }
  if (ageDays < 90) return { status: 'warning', riskLevel: 'HIGH (Registered < 90 days ago)' }
  if (ageDays < 365) return { status: 'warning', riskLevel: 'MEDIUM (Registered < 1 year ago)' }
  return { status: 'safe', riskLevel: 'LOW (Established domain)' }
}

export async function checkDomain(domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()

    // who-dat.as93.net (no key, ~250ms) → rdap.org fallback
    const domainInfo = await lookupWhois(cleanDomain)

    if (!domainInfo || !domainInfo.createdDate) {
      return {
        id: 'domain',
        name: 'Domain Age',
        icon: '📅',
        color: '#8b5cf6',
        desc: 'Check when the domain was registered',
        status: 'unknown',
        details: 'Could not retrieve domain registration date from any WHOIS source',
        evidence: { resolved: false },
        links: [
          { label: `WHOIS for ${cleanDomain}`, url: `https://whois.domaintools.com/${cleanDomain}` },
          { label: 'ICANN Lookup', url: `https://lookup.icann.org/lookup?name=${cleanDomain}` }
        ]
      }
    }

    const created = new Date(domainInfo.createdDate)
    const now = new Date()
    const ageMs = now - created
    const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)))
    const ageYears = (ageDays / 365.25).toFixed(1)

    const { status, riskLevel } = scoreDomain(ageDays)

    return {
      id: 'domain',
      name: 'Domain Age',
      icon: '📅',
      color: '#8b5cf6',
      desc: 'Check when the domain was registered',
      status,
      details: {
        registeredDate: created.toISOString().split('T')[0],
        ageDays: `${ageDays} days`,
        ageYears: `${ageYears} years`,
        riskLevel,
        registrar: domainInfo.registrar || 'Unknown',
        expiresDate: domainInfo.expiresDate ? new Date(domainInfo.expiresDate).toISOString().split('T')[0] : 'Unknown',
        source: domainInfo.source || 'unknown'
      },
      // Machine-readable twin of `details`. `details` is formatted for humans
      // ("123 days"); the scorer needs the raw numbers.
      evidence: {
        resolved: true,
        ageDays,
        registrationTermDays: domainInfo.expiresDate
          ? Math.floor((new Date(domainInfo.expiresDate) - created) / 86400000)
          : null,
        daysUntilExpiry: domainInfo.expiresDate
          ? Math.floor((new Date(domainInfo.expiresDate) - now) / 86400000)
          : null,
        registrar: domainInfo.registrar || null,
        source: domainInfo.source || null,
      },
      links: [
        { label: `WHOIS for ${cleanDomain}`, url: `https://whois.domaintools.com/${cleanDomain}` },
        { label: 'ICANN Lookup', url: `https://lookup.icann.org/lookup?name=${cleanDomain}` }
      ]
    }
  } catch (err) {
    return {
      id: 'domain',
      name: 'Domain Age',
      icon: '📅',
      color: '#8b5cf6',
      desc: 'Check when the domain was registered',
      status: 'error',
      error: err.message
    }
  }
}