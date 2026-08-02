import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import NodeCache from 'node-cache'

import { checkReddit } from './checks/reddit.js'
import { checkGoogle } from './checks/google.js'
import { checkDomain } from './checks/domain.js'
import { checkSSL } from './checks/ssl.js'
import { checkReputation } from './checks/reputation.js'
import { checkDNS } from './checks/dns.js'
import { withTimeout } from './checks/_timeout.js'
import { startOpenPhishFeed, getOpenPhishStatus } from './checks/openphish.js'

// Kick off the background OpenPhish feed download. It's tiny (~14KB) and
// loads once at boot, then auto-refreshes every 20 minutes in the background.
startOpenPhishFeed()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// 1h cache — same domain returns instantly
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 })

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, '../client/dist')))

function extractDomain(input) {
  try {
    const url = input.startsWith('http') ? new URL(input) : new URL(`https://${input}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return input.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '').toLowerCase()
  }
}

function getOverallStatus(results) {
  const statuses = results.map(r => r.status).filter(s => s !== 'error' && s !== 'unknown')
  if (statuses.includes('dangerous')) return 'dangerous'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.includes('safe')) return 'safe'
  return 'unknown'
}

// Checks grouped by speed: "core" results stream first (~1-2s),
// "community" results follow-up (~2-4s more). Frontend renders as they arrive.
const CORE_CHECKS = ['domain', 'ssl', 'dns', 'reputation']
const COMMUNITY_CHECKS = ['reddit', 'google']

const checkFns = {
  reddit: checkReddit,
  google: checkGoogle,
  domain: checkDomain,
  ssl: checkSSL,
  reputation: checkReputation,
  dns: checkDNS,
}

/**
 * Staggered endpoint. Runs the 4 core checks first and returns as soon as they're
 * done (or after a 2.5s hard cap). Reddit/Google run on a 3s cap and update the
 * cache; future identical queries return them immediately.
 *
 * Falls back to a single-shot JSON response for non-SSE clients.
 */
app.post('/api/check', async (req, res) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' })
  }

  const domain = extractDomain(url.trim())
  const cacheKey = `check:${domain}`
  const cached = cache.get(cacheKey)

  // Fully cached — return everything at once
  if (cached && cached.complete) {
    return res.json({ ...cached, cached: true })
  }

  const acceptSSE = (req.headers.accept || '').includes('text/event-stream')
  const useStaggered = acceptSSE && !cached

  // Non-staggered path (or fully cached): single-shot, wait for everything
  if (!useStaggered) {
    try {
      const all = await Promise.allSettled([
        withTimeout(checkReddit(domain), 3000, 'Reddit check timed out'),
        withTimeout(checkGoogle(domain), 3000, 'Google check timed out'),
        checkDomain(domain),
        checkSSL(domain),
        checkReputation(domain),
        checkDNS(domain),
      ])
      const checks = all.map((c, i) => {
        if (c.status === 'fulfilled') {
          // withTimeout returns { ok, value, reason }; unwrap to the check object.
          // Non-timeout-wrapped promises still satisfy `{ ok: true, value }` shape
          // because Promise.allSettled never wraps plain values — handle both.
          const r = c.value
          return r && typeof r === 'object' && 'ok' in r ? r.value : r
        }
        const id = ['reddit', 'google', 'domain', 'ssl', 'reputation', 'dns'][i]
        return { id, status: 'error', error: c.reason?.message || 'Check failed' }
      })
      const response = {
        domain,
        url: url.startsWith('http') ? url : `https://${domain}`,
        overall: getOverallStatus(checks),
        timestamp: new Date().toISOString(),
        checks,
        complete: true,
      }
      cache.set(cacheKey, response)
      return res.json(response)
    } catch (err) {
      console.error('Check error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  // Staggered SSE path
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  send('start', { domain, url: url.startsWith('http') ? url : `https://${domain}`, timestamp: new Date().toISOString() })

  // ── Core wave: domain, ssl, dns, reputation ──
  const coreIds = ['domain', 'ssl', 'dns', 'reputation']
  const coreResults = await Promise.allSettled(
    coreIds.map((id) => withTimeout(checkFns[id](domain), 2500, `${id} check timed out`))
  )

  const core = coreResults.map((c, i) => {
    if (c.status === 'fulfilled') {
      const r = c.value
      return r && typeof r === 'object' && 'ok' in r ? r.value : r
    }
    return { id: coreIds[i], status: 'error', error: c.reason?.message || 'Check failed' }
  })

  // Emit an interim verdict after core checks
  const interim = {
    domain,
    url: url.startsWith('http') ? url : `https://${domain}`,
    overall: getOverallStatus(core),
    timestamp: new Date().toISOString(),
    checks: core,
    partial: true,
  }
  send('core', interim)

  // ── Community wave: reddit, google ──
  const communityIds = ['reddit', 'google']
  const communityResults = await Promise.allSettled(
    communityIds.map((id) => withTimeout(checkFns[id](domain), 3000, `${id} check timed out`))
  )

  const community = communityResults.map((c, i) => {
    if (c.status === 'fulfilled') {
      const r = c.value
      return r && typeof r === 'object' && 'ok' in r ? r.value : r
    }
    return { id: communityIds[i], status: 'error', error: c.reason?.message || 'Check failed' }
  })

  const allChecks = [...core, ...community]
  const final = {
    domain,
    url: url.startsWith('http') ? url : `https://${domain}`,
    overall: getOverallStatus(allChecks),
    timestamp: new Date().toISOString(),
    checks: allChecks,
    complete: true,
  }
  cache.set(cacheKey, final)
  send('done', final)
  res.end()
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), openPhish: getOpenPhishStatus() })
})

// SPA fallback — serve index.html for known front-end routes so React can take over
app.get('/:page(about|privacy|terms|contact|how-it-works|404|500)', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'))
})

// 404 — any non-API, non-asset path that didn't match returns a styled HTML error page
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(404).sendFile(join(__dirname, 'errors/404.html'))
})

// 500 — last-resort error handler so unexpected crashes render a styled page instead of plain text
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Internal server error' })
  }
  res.status(500).sendFile(join(__dirname, 'errors/500.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})