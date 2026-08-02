/**
 * Workers-compatible replacement for the Node/cheerio version.
 * Drops `node-fetch` (use global fetch) and `cheerio` (use regex extraction
 * since DuckDuckGo HTML is simple and stable).
 *
 * SERPER_API_KEY: set via `wrangler secret put SERPER_API_KEY` (optional).
 */

function cleanLink(rawUrl) {
  if (!rawUrl) return ''
  try {
    if (rawUrl.includes('uddg=')) {
      const match = rawUrl.match(/uddg=([^&]+)/)
      if (match) return decodeURIComponent(match[1])
    }
    if (rawUrl.startsWith('//')) return `https:${rawUrl}`
    return rawUrl
  } catch {
    return rawUrl
  }
}

async function searchSerper(query, apiKey) {
  if (!apiKey) return null
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: query, num: 10 })
  })
  if (!response.ok) return null
  const data = await response.json()
  return (data.organic || []).map(item => ({
    title: item.title,
    snippet: item.snippet,
    link: cleanLink(item.link)
  }))
}

/**
 * DuckDuckGo HTML scraping — no cheerio, just regex.
 * DDG's HTML result page uses stable class names (as of 2024).
 * Returns up to 8 results with title/snippet/link.
 */
async function searchDuckDuckGo(query) {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(2500)
    })
    // Response.ok covers the whole 2xx range, so a bot-challenge served as 202
    // slips through. DuckDuckGo hands datacenter IPs (Cloudflare Workers
    // included) an `anomaly.js` interstitial instead of results — treat that as
    // "blocked" (null), which is different from "searched, found nothing" ([]).
    if (response.status !== 200) return null
    const html = await response.text()
    if (html.includes('anomaly.js')) return null

    const results = []
    // Each result block has class="result". We extract title/snippet/url via regex.
    // Anchor with class="result__a" contains title (text) and href (uddg= URL).
    // The result__snippet div contains the snippet text.
    // We split the HTML into result blocks first.
    const blocks = html.split(/class="result[ "]/)
    for (let i = 1; i < blocks.length && results.length < 8; i++) {
      const block = blocks[i]
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)<\/a>/)
      if (!titleMatch) continue
      const title = decodeHtmlEntities(titleMatch[1].trim())
      const urlMatch = block.match(/class="result__url"[^>]*href="([^"]+)"/)
      const rawLink = urlMatch ? urlMatch[1] : ''
      const link = cleanLink(rawLink)
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      const snippet = snippetMatch
        ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        : ''
      if (title) {
        results.push({ title, snippet, link: link || `https://${query.replace(/\s+reviews$/, '')}` })
      }
    }
    return results
  } catch {
    return null
  }
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Bing's RSS output. Verified working from Cloudflare egress IPs — unlike
 * DuckDuckGo's HTML endpoint, which serves datacenter ranges an `anomaly.js`
 * bot-challenge. Keyless, ~5KB, and trivially parseable, so this is the
 * primary no-credentials source.
 */
async function searchBingRSS(query) {
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(2500)
    })
    if (res.status !== 200) return null
    const xml = await res.text()

    const results = []
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const item = m[1]
      const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]
      const link = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]
      const desc = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || ''
      if (!title) continue
      results.push({
        title: decodeHtmlEntities(title.trim()),
        snippet: decodeHtmlEntities(desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
        link: (link || '').trim(),
      })
      if (results.length >= 8) break
    }
    return results.length > 0 ? results : null
  } catch {
    return null
  }
}

/**
 * Scam-checker aggregators auto-generate a page for virtually every domain,
 * titled things like "Is example.com a Scam? Reviews". Those titles match the
 * scam keywords below, so searching "<domain> reviews" scored almost any site
 * with SEO-farm coverage as suspicious — and two hits flipped the verdict to
 * dangerous. Their pages are still shown to the user; they just don't vote.
 */
const AGGREGATOR_HOSTS = [
  'scamadviser.com', 'scam-detector.com', 'scamminder.com', 'urlvoid.com',
  'scamvoid.com', 'trustscam.com', 'ismylinksafe.com', 'webparanoid.com',
  'checkwebsite.org', 'scamdoc.com', 'isitwebsitesafe.com', 'safeweb.norton.com',
  'mywot.com', 'scamrate.com', 'validin.com', 'siteadvisor.com',
]

function isAggregator(link) {
  try {
    const host = new URL(link).hostname.replace(/^www\./, '').toLowerCase()
    return AGGREGATOR_HOSTS.some((a) => host === a || host.endsWith(`.${a}`))
  } catch {
    return false
  }
}

function analyzeSearchResults(results, domain) {
  const scamKeywords = ['scam website', 'is a scam', 'fake site', 'phishing site', 'stole my money', 'ripoff report', 'fraudulent site']
  const warningKeywords = ['unreliable', 'bad experience', 'poor service', 'not recommended', 'customer complaints', 'caution']
  const safeKeywords = ['legitimate', 'trusted', 'reliable', 'recommend', 'good experience', 'verified', 'official', 'safe', 'reviews', 'trustpilot']

  let scamScore = 0, warningScore = 0, safeScore = 0
  let scamScoreRaw = 0, aggregatorCount = 0
  const items = []

  for (const result of results) {
    const text = `${result.title} ${result.snippet || ''}`.toLowerCase()
    const link = cleanLink(result.link)

    items.push({ title: result.title, snippet: result.snippet, url: link })

    const matchesScam = scamKeywords.some(k => text.includes(k))
    if (matchesScam) scamScoreRaw++

    // Aggregator pages are excluded from the verdict — their titles describe
    // the question, not an answer.
    if (isAggregator(link)) {
      aggregatorCount++
      continue
    }

    if (matchesScam) scamScore++
    else if (warningKeywords.some(k => text.includes(k))) warningScore++
    else if (safeKeywords.some(k => text.includes(k))) safeScore++
  }

  let status = 'safe'
  if (scamScore >= 2) status = 'dangerous'
  else if (scamScore === 1 || warningScore >= 2) status = 'warning'
  else if (safeScore > 0 || results.length > 0) status = 'safe'
  else status = 'unknown'

  return {
    status,
    details: {
      totalResults: results.length,
      scamWarnings: scamScore,
      cautionFlags: warningScore,
      positiveReviews: safeScore,
      ...(aggregatorCount > 0 && {
        excludedAggregatorPages: `${aggregatorCount} scam-checker listing${aggregatorCount > 1 ? 's' : ''} ignored (${scamScoreRaw - scamScore} keyword match${scamScoreRaw - scamScore === 1 ? '' : 'es'} not counted)`
      }),
      topWebResults: items.slice(0, 5)
    },
    evidence: {
      searched: true,
      totalResults: results.length,
      // Post-aggregator-filter count is what the scorer must use; the raw
      // count includes scam-checker pages that describe the question, not an answer.
      scamWarningsFiltered: scamScore,
      scamWarningsRaw: scamScoreRaw,
      cautionFlags: warningScore,
      positiveReviews: safeScore,
    },
    links: [
      { label: `Google Search for "${domain} reviews"`, url: `https://www.google.com/search?q=${encodeURIComponent(domain + ' reviews')}` },
      { label: `Trustpilot Reviews for ${domain}`, url: `https://www.trustpilot.com/search?query=${encodeURIComponent(domain)}` },
      ...items.slice(0, 3).map(r => ({ label: r.title.slice(0, 70), url: r.url }))
    ]
  }
}

export async function checkGoogle(domain, env) {
  try {
    const query = `${domain} reviews`
    const serperKey = env?.SERPER_API_KEY || null
    let results = await searchSerper(query, serperKey)

    // Track *why* we have no results so the user isn't told "nothing indexed"
    // when the truth is "we were never able to search".
    let fallbackBlocked = false

    // Bing RSS first — the only keyless source verified to work from Workers.
    if (!results || results.length === 0) {
      const bing = await searchBingRSS(query)
      if (bing) results = bing
    }

    // DuckDuckGo last: it usually bot-blocks Cloudflare IPs, but not always.
    if (!results || results.length === 0) {
      const ddg = await searchDuckDuckGo(query)
      if (ddg === null) fallbackBlocked = true
      else results = ddg
    }

    if (!results || results.length === 0) {
      const couldNotSearch = !serperKey && fallbackBlocked
      return {
        id: 'google',
        name: 'Google & Web Search',
        icon: '🔍',
        color: '#4285f4',
        desc: 'Search Google and web reviews for user feedback',
        status: 'unknown',
        details: couldNotSearch
          ? 'Web search unavailable — no search API key is configured and the fallback provider blocked this request. Use the links below to search manually.'
          : 'No web search results indexed for this domain',
        // "Blocked" and "searched, found nothing" mean opposite things to the
        // scorer: one is lost coverage, the other is a weak risk signal.
        evidence: couldNotSearch
          ? { searched: false }
          : { searched: true, totalResults: 0, scamWarningsFiltered: 0, scamWarningsRaw: 0, cautionFlags: 0, positiveReviews: 0 },
        links: [
          { label: `Google Search for "${domain} reviews"`, url: `https://www.google.com/search?q=${encodeURIComponent(domain + ' reviews')}` },
          { label: `Trustpilot Reviews for ${domain}`, url: `https://www.trustpilot.com/search?query=${encodeURIComponent(domain)}` }
        ]
      }
    }

    const analysis = analyzeSearchResults(results, domain)
    return {
      id: 'google',
      name: 'Google & Web Search',
      icon: '🔍',
      color: '#4285f4',
      desc: 'Search Google and web reviews for user feedback',
      ...analysis
    }
  } catch (err) {
    return {
      id: 'google',
      name: 'Google & Web Search',
      icon: '🔍',
      color: '#4285f4',
      desc: 'Search Google and web reviews for user feedback',
      status: 'unknown',
      details: 'Could not perform web search',
      links: [
        { label: `Google Search for "${domain} reviews"`, url: `https://www.google.com/search?q=${encodeURIComponent(domain + ' reviews')}` }
      ]
    }
  }
}