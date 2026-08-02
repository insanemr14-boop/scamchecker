/**
 * Trust scoring — pure, dependency-free, synchronous.
 *
 * Replaces a flat penalty model (dangerous -35, warning -15) in which a
 * confirmed phishing hit and a missing CAA record moved the score by
 * comparable amounts. Here they differ by ~150x.
 *
 * Shape: additive log-odds of fraud.
 *
 *   L     = PRIOR + cappedCircumstantialRisk + conclusiveRisk + trust * coverage
 *   P     = 1 / (1 + e^-L)
 *   score = 100 * (1 - P)
 *
 * Four mechanisms do the real work:
 *   1. Hard overrides   — near-conclusive evidence caps the score outright.
 *   2. Family cap       — weak circumstantial signals cannot accumulate into
 *                         a fraud verdict unless several independent ones fire.
 *   3. Asymmetric cov.  — coverage scales trust credit but never risk. You can
 *                         prove guilt with one source; you cannot prove
 *                         innocence with one.
 *   4. Evidence floor   — a site nothing has flagged cannot be called High Risk
 *                         on circumstantial grounds alone.
 *
 * The weights are informed priors, not fitted parameters. They are structurally
 * far better than flat penalties, but the constants — PRIOR above all — should
 * be refit against a labelled sample of real traffic. See SCORE_VERSION.
 */

export const SCORE_VERSION = '2.0.0'

// P(fraud) = 0.15 for an arbitrary submitted domain, so a domain with no
// evidence either way lands at 85: "nothing found against it", not "safe".
const PRIOR = -1.73

// Max total circumstantial risk, indexed by how many independent families fired.
const CIRC_CAP = [0, 0.8, 1.8, 2.6, 3.2]

// Coverage is weighted by how informative each source is, not n/6. `reputation`
// is really four independent sources and is split accordingly.
const COVERAGE_W = {
  domain: 0.24, ssl: 0.16, dns: 0.10, openphish: 0.14,
  cloudflare: 0.06, quad9: 0.06, virustotal: 0.08, google: 0.12, reddit: 0.04,
}

const BAND_COPY = {
  CLEAN: {
    label: 'Established & Clean',
    message: 'Long track record and no negative signals found. Still verify payment requests independently.',
  },
  NO_ISSUES: {
    label: 'No Issues Found',
    message: 'Nothing negative was found for this site. That is not a guarantee of safety.',
  },
  UNPROVEN: {
    label: 'Unproven — Limited Track Record',
    message: 'No negative evidence found, but this domain is too new or too obscure to vouch for. Verify independently before sending money or personal details.',
  },
  LIKELY_UNSAFE: {
    label: 'Likely Unsafe',
    message: 'Multiple risk signals detected. Do not enter payment or login details.',
  },
  HIGH_RISK: {
    label: 'High Risk',
    message: 'Strong evidence of fraud. Do not use this site.',
  },
  UNRESOLVED: {
    label: 'Domain Does Not Resolve',
    message: 'This domain has no DNS records. It may be unregistered, expired, or parked — which is not by itself evidence of fraud.',
  },
}

export function bandToOverall(band) {
  if (band === 'HIGH_RISK' || band === 'LIKELY_UNSAFE') return 'dangerous'
  if (band === 'UNPROVEN') return 'warning'
  if (band === 'UNRESOLVED') return 'unknown'
  return 'safe'
}

const add = (bucket, label, weight) => {
  if (weight !== 0) bucket.push({ label, weight })
}
const sum = (arr) => arr.reduce((s, x) => s + x.weight, 0)

export function scoreScan(checks) {
  const by = Object.fromEntries((checks || []).filter(Boolean).map((c) => [c.id, c]))
  const E = (id) => by[id]?.evidence ?? null

  const conclusive = []
  const circ = { age: [], tls: [], hygiene: [], presence: [] }
  const trust = []
  const overrides = []
  const sources = new Set()

  const dns = E('dns')
  const rep = E('reputation')
  const ssl = E('ssl')
  const dom = E('domain')

  // ── 0. Does it resolve at all? ──────────────────────────────────────────
  if (dns && !dns.hasA && !dns.hasAAAA && dns.nsCount === 0) {
    return {
      version: SCORE_VERSION, score: null, band: 'UNRESOLVED', ...BAND_COPY.UNRESOLVED,
      probabilityFraud: null, coverage: 0, confidence: 'low',
      sourcesUsed: [], capped: false, contributions: [],
    }
  }

  // ── 1. Conclusive evidence — may drive a verdict alone ──────────────────
  if (rep) {
    const { openPhish: op, cloudflare: cf, quad9: q9, virusTotal: vt } = rep

    if (op?.available) {
      sources.add('openphish')
      if (op.flagged && op.matchKind === 'exact-host') {
        add(conclusive, 'Listed in OpenPhish phishing feed (exact host)', 6.0)
        overrides.push(2)
      } else if (op.flagged && op.matchKind === 'registrable') {
        add(conclusive, 'Domain listed in OpenPhish phishing feed', 4.5)
        overrides.push(2)
      } else if (!op.flagged) {
        add(trust, 'Not listed in OpenPhish feed', -0.10)
      }
    }

    const blocked = []
    if (cf?.checked) {
      sources.add('cloudflare')
      cf.blocked ? blocked.push('Cloudflare') : add(trust, 'Clean on Cloudflare threat intelligence', -0.10)
    }
    if (q9?.checked) {
      sources.add('quad9')
      q9.blocked ? blocked.push('Quad9') : add(trust, 'Clean on Quad9 threat intelligence', -0.10)
    }
    // Two independent vendors agreeing is what makes this decisive; one alone
    // carries a real false-positive rate (stale entries, shared-IP collateral).
    if (blocked.length >= 2) {
      add(conclusive, 'Blocked by Cloudflare and Quad9 threat intelligence', 7.0)
      overrides.push(8)
    } else if (blocked.length === 1) {
      add(conclusive, `Blocked by ${blocked[0]} threat intelligence`, 3.5)
      overrides.push(22)
    }

    if (vt?.checked) {
      sources.add('virustotal')
      const m = vt.malicious || 0
      const s = vt.suspicious || 0
      if (m >= 5) { add(conclusive, `${m} VirusTotal engines flag this domain`, 5.0); overrides.push(10) }
      else if (m >= 3) { add(conclusive, `${m} VirusTotal engines flag this domain`, 3.0); overrides.push(25) }
      else if (m === 2) add(conclusive, '2 VirusTotal engines flag this domain', 1.6)
      // A single-engine VT hit is the best-known false-positive mode in the
      // industry — deliberately weak.
      else if (m === 1) add(conclusive, '1 VirusTotal engine flags this domain', 0.6)
      else if (s >= 3) add(conclusive, `${s} VirusTotal engines mark this suspicious`, 0.8)
      else if (m === 0 && s === 0 && (vt.total || 0) >= 60) {
        add(trust, `Clean across ${vt.total} VirusTotal engines`, -0.60)
      }
    }
  }

  const rd = E('reddit')
  if (rd?.searched) {
    sources.add('reddit')
    const scam = rd.scamWarnings || 0
    // Upvotes are the corroboration gate: they separate community consensus
    // from one keyword collision or a single angry poster. The RSS feed does
    // not expose scores, so in practice this only fires on the OAuth path.
    const corroborated = scam >= 2 && (rd.maxPostScore || 0) >= 5 && scam > (rd.positiveMentions || 0) * 2
    if (corroborated) {
      add(conclusive, `${scam} upvoted Reddit scam reports`, 2.8)
      overrides.push(30)
    } else if (scam >= 1) {
      add(conclusive, 'Unverified Reddit scam mention', 0.8)
    }
    if (scam === 0 && (rd.totalDiscussions || 0) >= 5) {
      add(trust, `Discussed ${rd.totalDiscussions}x on Reddit with no scam reports`, -0.60)
    } else if (scam === 0 && (rd.positiveMentions || 0) > 0) {
      add(trust, 'Positive Reddit mentions', -0.30)
    }
  }

  const gg = E('google')
  if (gg?.searched) {
    sources.add('google')
    const sw = gg.scamWarningsFiltered || 0
    if (sw >= 2) { add(conclusive, `${sw} independent pages describe this as a scam`, 1.8); overrides.push(35) }
    else if (sw === 1) add(conclusive, 'One page describes this as a scam', 0.5)
    if ((gg.cautionFlags || 0) >= 2) add(conclusive, 'Multiple complaint signals in search results', 0.30)

    if (gg.totalResults === 0) add(circ.presence, 'No web search results for this domain', 0.25)
    else if ((gg.totalResults || 0) >= 5) add(trust, 'Established web search presence', -0.35)
  }

  // ── 2. Circumstantial: domain age ───────────────────────────────────────
  let ageDays = null
  if (dom?.resolved) {
    sources.add('domain')
    ageDays = dom.ageDays
    const w = ageDays < 7 ? 2.00 : ageDays < 30 ? 1.50
      : ageDays < 90 ? 0.70 : ageDays < 180 ? 0.35
        : ageDays < 365 ? 0.15 : ageDays < 730 ? -0.30
          : ageDays < 1825 ? -0.90 : ageDays < 3650 ? -1.50 : -2.10
    const label = `Domain registered ${ageDays} days ago`
    w > 0 ? add(circ.age, label, w) : add(trust, label, w)

    // Scammers buy one year. Multi-year registration is a small, cheap positive.
    if ((dom.registrationTermDays || 0) > 730) add(trust, 'Registered for a multi-year term', -0.25)
    if (dom.daysUntilExpiry != null && dom.daysUntilExpiry <= 30) {
      add(circ.age, 'Registration expires within 30 days', 0.20)
    }
  }

  // ── 3. Circumstantial: TLS ──────────────────────────────────────────────
  if (ssl) {
    sources.add('ssl')
    // Weak by modern standards: phishing sites universally have valid LE certs,
    // so missing HTTPS now correlates with abandoned/parked more than fraud.
    if (!ssl.hasValidCert && !ssl.httpsReachable) {
      add(circ.tls, 'No valid certificate and HTTPS unreachable', 1.00)
    } else if (!ssl.hasValidCert && ssl.ctLookupOk) {
      add(circ.tls, 'Certificates exist but none are currently valid', 0.80)
    }
    // httpsReachable && !ctLookupOk is a crt.sh outage, not a signal → 0.

    if (ssl.hasValidCert && ssl.daysUntilExpiry != null && ssl.daysUntilExpiry < 7) {
      add(circ.tls, 'Certificate expires within a week', 0.20)
    }

    const f = ssl.certFirstSeenDays
    if (f != null) {
      if (f < 14) add(circ.tls, 'First certificate issued within the last 2 weeks', 0.40)
      else if (f < 90) add(circ.tls, 'Short certificate history', 0.15)
      else if (f > 1095) add(trust, `${Math.floor(f / 365)} years of certificate history`, -1.20)
      else if (f > 365) add(trust, 'Over a year of certificate history', -0.60)
    }
    if ((ssl.validCertCount || 0) >= 3) add(trust, 'Multiple active certificates', -0.20)
  }

  // ── 4. Circumstantial: DNS hygiene — clamped hard ───────────────────────
  // The entire family is worth at most ±0.35 logits (~4 points). A missing CAA
  // record is 0.04 against a phishing hit's 6.0. That ratio is the point.
  if (dns) {
    sources.add('dns')
    const h = []
    if (!dns.hasSPF) add(h, 'No SPF record', 0.10)
    if (!dns.hasDMARC) add(h, 'No DMARC record', 0.08)
    if (!dns.hasCAA) add(h, 'No CAA record', 0.04)
    if ((dns.nsCount || 0) < 2) add(h, 'Fewer than 2 nameservers', 0.15)
    if (!dns.hasA && (dns.nsCount || 0) > 0) add(h, 'Registered but not hosting content', 0.40)
    // hasMX is never scored: a brochure site that receives no mail is normal.
    if (dns.hasSPF) add(h, 'SPF configured', -0.05)
    if (dns.hasCAA) add(h, 'CAA configured', -0.05)
    if (dns.dmarcPolicy === 'reject' || dns.dmarcPolicy === 'quarantine') {
      add(h, 'Enforcing DMARC policy', -0.25)
    }
    if (dns.dnssecAD) add(h, 'DNSSEC validated', -0.20)

    const raw = sum(h)
    const clamped = Math.max(-0.45, Math.min(0.35, raw))
    const scale = raw === 0 ? 0 : clamped / raw
    for (const x of h) {
      const w = x.weight * scale
      w > 0 ? add(circ.hygiene, x.label, w) : add(trust, x.label, w)
    }
  }

  // ── 5. Combine ──────────────────────────────────────────────────────────
  const conclusiveRisk = sum(conclusive.filter((x) => x.weight > 0))
  const famSums = Object.values(circ).map(sum)
  const famsFired = famSums.filter((v) => v >= 0.05).length
  const circRaw = famSums.reduce((s, v) => s + Math.max(0, v), 0)
  const cap = (CIRC_CAP[famsFired] ?? CIRC_CAP[CIRC_CAP.length - 1]) + (conclusiveRisk > 0 ? 0.8 : 0)
  const circRisk = Math.min(circRaw, cap)

  let coverage = 0
  for (const s of sources) coverage += COVERAGE_W[s] || 0
  coverage = Math.min(1, coverage)

  const trustCredit = sum(trust) // negative
  const L = PRIOR + conclusiveRisk + circRisk + trustCredit * coverage
  const p = 1 / (1 + Math.exp(-L))
  let score = Math.max(1, Math.min(99, Math.round(100 * (1 - p))))

  // ── 6. Overrides, floor, coverage gates ─────────────────────────────────
  for (const o of overrides) score = Math.min(score, o)

  const blocklistsClean = rep
    ? !rep.openPhish?.flagged && !rep.cloudflare?.blocked && !rep.quad9?.blocked &&
      (rep.virusTotal?.malicious || 0) === 0
    : false
  const httpsOk = Boolean(ssl?.hasValidCert || ssl?.httpsReachable)

  // Nothing has flagged it and it serves valid HTTPS — circumstantial evidence
  // alone must not be able to call that High Risk.
  if (conclusiveRisk === 0 && blocklistsClean && httpsOk) {
    score = Math.max(score, ageDays != null && ageDays >= 30 ? 55 : 40)
  }

  // Gates apply to the trust direction only. A thin scan that finds a phishing
  // hit still reports High Risk — at low confidence.
  if (coverage < 0.60) score = Math.min(score, 74)
  if (coverage < 0.80) score = Math.min(score, 89)

  const band = score >= 90 ? 'CLEAN' : score >= 75 ? 'NO_ISSUES'
    : score >= 55 ? 'UNPROVEN' : score >= 30 ? 'LIKELY_UNSAFE' : 'HIGH_RISK'

  const contributions = [
    ...conclusive,
    ...Object.values(circ).flat(),
    ...trust.map((x) => ({ ...x, weight: x.weight * coverage })),
  ]
    .filter((x) => Math.abs(x.weight) >= 0.01)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 8)
    .map((x) => ({ label: x.label, effect: x.weight > 0 ? 'risk' : 'trust' }))

  return {
    version: SCORE_VERSION,
    score,
    band,
    ...BAND_COPY[band],
    probabilityFraud: Number(p.toFixed(3)),
    coverage: Number(coverage.toFixed(2)),
    confidence: coverage >= 0.75 ? 'high' : coverage >= 0.45 ? 'moderate' : 'low',
    sourcesUsed: [...sources],
    capped: circRaw > cap,
    contributions,
  }
}
