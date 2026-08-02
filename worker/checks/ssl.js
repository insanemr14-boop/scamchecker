/**
 * SSL certificate check via crt.sh (Certificate Transparency logs).
 *
 * Workers-compatible: raw TCP/TLS sockets are NOT available on Cloudflare Workers,
 * so we can't directly inspect the certificate presented by the server. Instead
 * we look up all certs issued for the domain from public CT logs (crt.sh). This
 * gives us validity dates, issuer, and the most recent certificate.
 *
 * Limitation: We no longer report protocol (TLS 1.2/1.3) or cipher. crt.sh returns
 * the certs that have been issued, not what's currently negotiated.
 */

import { fastFetch, withTimeout } from './_timeout.js'

/**
 * Fetch all certs from crt.sh for a domain. Returns the most recent valid one.
 * crt.sh is notoriously flaky (frequent 502/504 errors), so we swallow all
 * errors here and treat it as "no data" rather than failing the whole check.
 */
async function fetchCerts(domain) {
  try {
    const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`
    const { ok, value } = await withTimeout(
      fastFetch(url, { headers: { 'Accept': 'application/json' } }, { timeoutMs: 3000 }),
      3500,
      'crt.sh lookup timed out'
    )
    if (!ok || !value?.ok) return []
    try {
      const data = await value.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  } catch {
    return []
  }
}

/**
 * Smoke test — try to actually reach the domain over HTTPS.
 * Returns true if it responded (any status code); false on connection error.
 */
async function httpsReachable(domain) {
  try {
    const res = await fastFetch(`https://${domain}`, { method: 'HEAD', redirect: 'manual' }, { timeoutMs: 2000 })
    // Any response (even 4xx/5xx) means SSL handshake worked — site is reachable over HTTPS.
    return true
  } catch {
    return false
  }
}

export async function checkSSL(domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()

    // Run cert lookup and HTTPS reachability in parallel
    const [certs, reachable] = await Promise.all([
      fetchCerts(cleanDomain),
      httpsReachable(cleanDomain),
    ])

    const now = Date.now()
    const allCerts = certs
      .filter(c => c.not_before && c.not_after)
      .map(c => ({
        notBefore: new Date(c.not_before).getTime(),
        notAfter: new Date(c.not_after).getTime(),
        issuer: c.issuer_name || 'Unknown',
        commonName: c.common_name || cleanDomain,
      }))

    // Oldest cert ever issued, computed before the valid-only filter below
    // discards history. CT logs are append-only and public, so a long issuance
    // record is cheap, forge-proof corroboration of a domain's real age.
    const firstSeen = allCerts.length > 0 ? Math.min(...allCerts.map(c => c.notBefore)) : null
    const certFirstSeenDays = firstSeen ? Math.floor((now - firstSeen) / 86400000) : null

    // Currently-valid certs, sorted by expiry descending
    const validCerts = allCerts
      .filter(c => c.notAfter >= now && c.notBefore <= now)
      .sort((a, b) => b.notAfter - a.notAfter)

    // Shared by every return path below.
    const baseEvidence = {
      ctLookupOk: certs.length > 0,
      httpsReachable: reachable,
      hasValidCert: validCerts.length > 0,
      validCertCount: validCerts.length,
      certFirstSeenDays,
      daysUntilExpiry: null,
      issuer: null,
    }

    if (validCerts.length === 0 && !reachable) {
      // No valid cert found AND site unreachable over HTTPS — likely no SSL
      return {
        id: 'ssl',
        name: 'SSL Certificate',
        icon: '🔒',
        color: '#10b981',
        desc: 'Verify SSL/TLS certificate validity',
        status: 'dangerous',
        details: { valid: false, error: 'No SSL certificate found in CT logs and HTTPS unreachable' },
        evidence: baseEvidence,
        links: [
          { label: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${cleanDomain}` },
          { label: 'Crt.sh Lookup', url: `https://crt.sh/?q=${cleanDomain}` }
        ]
      }
    }

    if (validCerts.length === 0 && reachable) {
      // crt.sh failed (502 etc.) but the site does serve HTTPS — degraded but not dangerous
      return {
        id: 'ssl',
        name: 'SSL Certificate',
        icon: '🔒',
        color: '#10b981',
        desc: 'Verify SSL/TLS certificate validity',
        status: 'safe',
        details: {
          valid: 'Yes (HTTPS reachable, cert details unavailable)',
          note: 'CT log lookup failed; cert validity confirmed via HTTPS handshake',
          source: 'https-probe',
        },
        evidence: baseEvidence,
        links: [
          { label: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${cleanDomain}` },
          { label: 'Crt.sh Lookup', url: `https://crt.sh/?q=${cleanDomain}` }
        ]
      }
    }

    if (validCerts.length === 0) {
      // Certs found but none currently valid (expired / not yet valid)
      return {
        id: 'ssl',
        name: 'SSL Certificate',
        icon: '🔒',
        color: '#10b981',
        desc: 'Verify SSL/TLS certificate validity',
        status: 'dangerous',
        details: { valid: false, error: 'No currently-valid SSL certificate found in CT logs' },
        evidence: baseEvidence,
        links: [
          { label: 'Crt.sh Certificate Logs', url: `https://crt.sh/?q=${cleanDomain}` }
        ]
      }
    }

    const cert = validCerts[0]
    const validTo = new Date(cert.notAfter)
    const daysUntilExpiry = Math.ceil((cert.notAfter - now) / (1000 * 60 * 60 * 24))

    // Let's Encrypt issues 90-day certs and renews at the 30-day mark by
    // design, so a <30-day window is the normal steady state for a correctly
    // operated site — flagging it penalised a third of the web at random.
    // Only a genuinely imminent expiry is worth a warning.
    let status = 'safe'
    if (daysUntilExpiry < 0) status = 'dangerous'
    else if (daysUntilExpiry < 7) status = 'warning'

    return {
      id: 'ssl',
      name: 'SSL Certificate',
      icon: '🔒',
      color: '#10b981',
      desc: 'Verify SSL/TLS certificate validity',
      status,
      details: {
        valid: status === 'safe' ? 'Yes (Valid Certificate)' : (status === 'warning' ? 'Yes, but expiring soon' : 'No (Expired)'),
        issuedTo: cert.commonName,
        issuer: cert.issuer,
        validFrom: new Date(cert.notBefore).toISOString().split('T')[0],
        validTo: validTo.toISOString().split('T')[0],
        daysUntilExpiry: `${daysUntilExpiry} days remaining`,
        source: 'crt.sh',
        certCount: validCerts.length,
      },
      evidence: { ...baseEvidence, daysUntilExpiry, issuer: cert.issuer },
      links: [
        { label: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${cleanDomain}` },
        { label: 'Crt.sh Certificate Logs', url: `https://crt.sh/?q=${cleanDomain}` }
      ]
    }
  } catch (err) {
    return {
      id: 'ssl',
      name: 'SSL Certificate',
      icon: '🔒',
      color: '#10b981',
      desc: 'Verify SSL/TLS certificate validity',
      status: 'error',
      error: err.message
    }
  }
}