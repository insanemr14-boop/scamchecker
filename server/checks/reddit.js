import { fastFetch } from './_timeout.js'

const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'ScamChecker/1.0'

function analyzePosts(posts, domain) {
  if (!posts || posts.length === 0) {
    return { status: 'unknown', details: 'No Reddit discussions found for this domain' }
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
    links: [
      { label: `Reddit Search for ${domain}`, url: `https://www.reddit.com/search/?q=${encodeURIComponent(domain)}` },
      ...relevantPosts.slice(0, 3).map(p => ({ label: `[${p.subreddit}] ${p.title.slice(0, 60)}...`, url: p.url }))
    ]
  }
}

/**
 * Pullpush is the fastest no-auth path to Reddit search.
 * Skip OAuth token entirely — it's rarely used and adds a round-trip.
 */
async function searchPullpush(domain) {
  const query = encodeURIComponent(domain)
  const res = await fastFetch(`https://api.pullpush.io/reddit/search/submission/?q=${query}&size=15`, {
    headers: { 'User-Agent': REDDIT_USER_AGENT }
  }, { timeoutMs: 2000 })
  if (!res.ok) throw new Error(`Pullpush API status ${res.status}`)
  const data = await res.json()
  return data.data || []
}

export async function checkReddit(domain) {
  try {
    const posts = await searchPullpush(domain)
    const analysis = analyzePosts(posts, domain)
    return {
      id: 'reddit',
      name: 'Reddit',
      icon: '🔴',
      color: '#ff4500',
      desc: 'Search Reddit discussions and community feedback',
      ...analysis
    }
  } catch (err) {
    return {
      id: 'reddit',
      name: 'Reddit',
      icon: '🔴',
      color: '#ff4500',
      desc: 'Search Reddit discussions and community feedback',
      status: 'unknown',
      details: 'Could not fetch Reddit posts',
      links: [
        { label: `Search Reddit for ${domain}`, url: `https://www.reddit.com/search/?q=${encodeURIComponent(domain)}` }
      ]
    }
  }
}