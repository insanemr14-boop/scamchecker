import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
const SERPER_API_KEY = process.env.SERPER_API_KEY

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

async function searchSerper(query) {
  if (!SERPER_API_KEY) return null
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
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

async function searchDuckDuckGo(query) {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(2500)
    })
    if (!response.ok) return []
    const html = await response.text()
    const $ = cheerio.load(html)
    const results = []

    $('.result').each((i, el) => {
      if (i >= 8) return
      const title = $(el).find('.result__title').text().trim()
      const snippet = $(el).find('.result__snippet').text().trim()
      const rawLink = $(el).find('.result__url').attr('href') || ''
      const link = cleanLink(rawLink)
      if (title) {
        results.push({ title, snippet, link: link || `https://${domain}` })
      }
    })
    return results
  } catch {
    return []
  }
}

function analyzeSearchResults(results, domain) {
  const scamKeywords = ['scam website', 'is a scam', 'fake site', 'phishing site', 'stole my money', 'ripoff report', 'fraudulent site']
  const warningKeywords = ['unreliable', 'bad experience', 'poor service', 'not recommended', 'customer complaints', 'caution']
  const safeKeywords = ['legitimate', 'trusted', 'reliable', 'recommend', 'good experience', 'verified', 'official', 'safe', 'reviews', 'trustpilot']

  let scamScore = 0, warningScore = 0, safeScore = 0
  const items = []

  for (const result of results) {
    const text = `${result.title} ${result.snippet || ''}`.toLowerCase()

    items.push({
      title: result.title,
      snippet: result.snippet,
      url: cleanLink(result.link)
    })

    if (scamKeywords.some(k => text.includes(k))) scamScore++
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
      topWebResults: items.slice(0, 5)
    },
    links: [
      { label: `Google Search for "${domain} reviews"`, url: `https://www.google.com/search?q=${encodeURIComponent(domain + ' reviews')}` },
      { label: `Trustpilot Reviews for ${domain}`, url: `https://www.trustpilot.com/search?query=${encodeURIComponent(domain)}` },
      ...items.slice(0, 3).map(r => ({ label: r.title.slice(0, 70), url: r.url }))
    ]
  }
}

export async function checkGoogle(domain) {
  try {
    const query = `${domain} reviews`
    let results = await searchSerper(query)

    if (!results || results.length === 0) {
      results = await searchDuckDuckGo(query)
    }

    if (!results || results.length === 0) {
      return {
        id: 'google',
        name: 'Google & Web Search',
        icon: '🔍',
        color: '#4285f4',
        desc: 'Search Google and web reviews for user feedback',
        status: 'unknown',
        details: 'No web search results indexed for this domain',
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