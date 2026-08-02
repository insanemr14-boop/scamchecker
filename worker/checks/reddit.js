import { fastFetch } from './_timeout.js'

const REDDIT_USER_AGENT = 'ScamChecker/1.0 (Workers)'

function analyzePosts(posts, domain) {
  if (!posts || posts.length === 0) {
    return {
      status: 'unknown',
      details: 'No Reddit discussions found for this domain',
      // Searched successfully, found nothing. Silence is not a risk signal —
      // almost no legitimate small site is discussed on Reddit.
      evidence: { searched: true, totalDiscussions: 0, scamWarnings: 0, cautionNotes: 0, positiveMentions: 0, maxPostScore: 0 },
      links: [
        { label: `Reddit Search for ${domain}`, url: `https://www.reddit.com/search/?q=${encodeURIComponent(domain)}` }
      ]
    }
  }

  const scamKeywords = ['scam site', 'fake site', 'phishing site', 'stolen money', 'scammer website', 'rip-off website', 'fraud website']
  const warningKeywords = ['suspicious', 'weird', 'strange', 'be careful', 'warning', 'sketchy', 'shady', 'issue', 'problem', 'impersonat']
  const safeKeywords = ['legit', 'legitimate', 'safe', 'trusted', 'reliable', 'good experience', 'recommend', 'official']

  let scamCount = 0, warningCount = 0, safeCount = 0
  const relevantPosts = []

  for (const post of posts.slice(0, 15)) {
    const text = `${post.title} ${post.selftext || ''}`.toLowerCase()

    const item = {
      title: post.title,
      subreddit: post.subreddit_name_prefixed || post.subreddit || 'r/all',
      score: post.score || 0,
      url: post.permalink?.startsWith('http') ? post.permalink : `https://reddit.com${post.permalink || post.url || ''}`,
      created: post.created_utc ? new Date(post.created_utc * 1000).toISOString().split('T')[0] : ''
    }
    relevantPosts.push(item)

    if (scamKeywords.some(k => text.includes(k))) scamCount++
    else if (warningKeywords.some(k => text.includes(k))) warningCount++
    else if (safeKeywords.some(k => text.includes(k))) safeCount++
  }

  let status = 'unknown'
  if (scamCount >= 3 && scamCount > safeCount * 2) status = 'dangerous'
  else if (scamCount >= 1 || warningCount >= 2) status = 'warning'
  else if (safeCount > 0 || relevantPosts.length > 0) status = 'safe'

  return {
    status,
    details: {
      totalDiscussions: relevantPosts.length,
      scamWarnings: scamCount,
      cautionNotes: warningCount,
      positiveMentions: safeCount,
      recentPosts: relevantPosts.slice(0, 5)
    },
    evidence: {
      searched: true,
      totalDiscussions: relevantPosts.length,
      scamWarnings: scamCount,
      cautionNotes: warningCount,
      positiveMentions: safeCount,
      // 0 via the RSS feed, which carries no score field. Only the OAuth path
      // populates this, so the corroboration gate stays conservative.
      maxPostScore: relevantPosts.reduce((m, p) => Math.max(m, p.score || 0), 0),
    },
    links: [
      { label: `Reddit Search for ${domain}`, url: `https://www.reddit.com/search/?q=${encodeURIComponent(domain)}` },
      ...relevantPosts.slice(0, 3).map(p => ({ label: `[${p.subreddit}] ${p.title.slice(0, 60)}...`, url: p.url }))
    ]
  }
}

// Cached app-only OAuth token, scoped to this isolate. Reddit tokens last ~1h.
let tokenCache = { token: null, expiresAt: 0 }

/**
 * Reddit's app-only OAuth. This is the only Reddit path that works from
 * Cloudflare egress IPs — the anonymous .json search endpoints return 403 to
 * datacenter ranges regardless of User-Agent. Returns null when unconfigured.
 */
async function getRedditToken(env) {
  const id = env?.REDDIT_CLIENT_ID
  const secret = env?.REDDIT_CLIENT_SECRET
  if (!id || !secret) return null

  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const res = await fastFetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT
    },
    body: 'grant_type=client_credentials'
  }, { timeoutMs: 2000 })

  if (!res.ok) throw new Error(`Reddit auth status ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('Reddit auth returned no token')

  // Refresh a minute early so we never present an expired token.
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000
  }
  return tokenCache.token
}

async function searchRedditOAuth(domain, env) {
  const token = await getRedditToken(env)
  if (!token) return null

  const res = await fastFetch(
    `https://oauth.reddit.com/search?q=${encodeURIComponent(domain)}&limit=15&sort=relevance`,
    { headers: { Authorization: `Bearer ${token}`, 'User-Agent': REDDIT_USER_AGENT } },
    { timeoutMs: 2500 }
  )
  if (!res.ok) throw new Error(`Reddit search status ${res.status}`)
  const data = await res.json()
  return (data?.data?.children || []).map(c => c.data)
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * Reddit's Atom search feed. Verified working from Cloudflare egress IPs:
 * /search.json returns 403 to datacenter ranges, but /search.rss returns 200.
 * Keyless, so this is the primary source — no credentials required.
 * Trade-off: the feed carries no score field, so vote counts are unavailable.
 */
async function searchRedditRSS(domain) {
  // Quote the domain. An unquoted `stripe.com` tokenises to "stripe" and
  // matches unrelated posts, which then feed the scam-keyword analysis.
  const res = await fastFetch(
    `https://www.reddit.com/search.rss?q=${encodeURIComponent(`"${domain}"`)}&limit=15&sort=relevance`,
    { headers: { 'User-Agent': REDDIT_USER_AGENT, Accept: 'application/atom+xml' } },
    { timeoutMs: 4000 } // the feed is routinely >2.5s for broader queries
  )
  if (!res.ok) throw new Error(`Reddit RSS status ${res.status}`)
  const xml = await res.text()

  const posts = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    if (!title) continue
    const href = e.match(/<link[^>]*href="([^"]+)"/)?.[1] || ''
    // The permalink is the reliable source; <category> is often absent.
    const sub = href.match(/reddit\.com\/r\/([^/]+)/)?.[1]
      || e.match(/<category[^>]*label="r\/([^"]+)"/)?.[1]
      || e.match(/<category[^>]*term="([^"]+)"/)?.[1]
      || null
    const updated = e.match(/<updated>([^<]+)<\/updated>/)?.[1]
    // <content> is escaped HTML; strip tags for keyword analysis.
    const content = e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || ''

    posts.push({
      title: decodeXml(title).trim(),
      selftext: decodeXml(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
      subreddit_name_prefixed: sub ? (sub.startsWith('r/') ? sub : `r/${sub}`) : 'r/all',
      score: 0, // not exposed by the Atom feed
      permalink: decodeXml(href),
      created_utc: updated ? Math.floor(new Date(updated).getTime() / 1000) : 0,
    })
  }
  return posts
}

/**
 * Public pullpush mirror — no auth, but the service has been returning 502 for
 * all callers, so it is a fallback rather than the primary source.
 */
async function searchPullpush(domain) {
  const query = encodeURIComponent(domain)
  const res = await fastFetch(`https://api.pullpush.io/reddit/search/submission/?q=${query}&size=15`, {
    headers: { 'User-Agent': REDDIT_USER_AGENT }
  }, { timeoutMs: 2500 })
  if (!res.ok) throw new Error(`Pullpush API status ${res.status}`)
  const data = await res.json()
  return data.data || []
}

export async function checkReddit(domain, env) {
  const base = {
    id: 'reddit',
    name: 'Reddit',
    icon: '🔴',
    color: '#ff4500',
    desc: 'Search Reddit discussions and community feedback'
  }

  const errors = []
  let posts = null

  // 1. Atom search feed — keyless and works from Workers. Primary source.
  try {
    posts = await searchRedditRSS(domain)
  } catch (err) {
    errors.push(err.message)
  }

  // 2. Authenticated API, if credentials happen to be configured. Returns null
  //    when they are not. Gives vote counts the RSS feed lacks.
  if (posts === null) {
    try {
      posts = await searchRedditOAuth(domain, env)
    } catch (err) {
      errors.push(err.message)
    }
  }

  // 3. Public mirror, currently 502ing for everyone.
  if (posts === null) {
    try {
      posts = await searchPullpush(domain)
    } catch (err) {
      errors.push(err.message)
    }
  }

  if (posts === null) {
    return {
      ...base,
      status: 'unknown',
      details: `Reddit search is temporarily unavailable (${errors.join('; ')}). Use the link below to search manually.`,
      evidence: { searched: false },
      links: [
        { label: `Search Reddit for ${domain}`, url: `https://www.reddit.com/search/?q=${encodeURIComponent(domain)}` }
      ]
    }
  }

  return { ...base, ...analyzePosts(posts, domain) }
}