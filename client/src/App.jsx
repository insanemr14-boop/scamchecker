import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle, AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronUp,
  Database, ExternalLink, Globe2, Info, Loader2, LockKeyhole,
  MessageSquare, Moon, Search, ShieldCheck, ShieldAlert, Sun, XCircle
} from 'lucide-react'
import { PAGE_ROUTES, ROUTE_META } from './routes.js'
import { PAGE_CONTENT } from './content/pages.js'
import { HOME_FAQ } from './content/faq.js'

/** Guide titles for the homepage, injected at build time by vite.config.js. */
const GUIDE_LINKS = typeof __GUIDE_LINKS__ !== 'undefined' ? __GUIDE_LINKS__ : []
import './App.css'

const CHECK_TYPES = [
  { id: 'domain', name: 'Domain history', description: 'Registration age, registrar & expiry', icon: Calendar },
  { id: 'ssl', name: 'SSL certificate', description: 'Encryption, issuer & validity', icon: LockKeyhole },
  { id: 'reddit', name: 'Community reports', description: 'Relevant Reddit discussions', icon: MessageSquare },
  { id: 'google', name: 'Web reputation', description: 'Search results & reported concerns', icon: Search },
  { id: 'reputation', name: 'Threat intelligence', description: 'Malware & phishing databases', icon: Database },
  { id: 'dns', name: 'DNS security', description: 'DNS, SPF & DMARC configuration', icon: Globe2 },
]

const EXAMPLES = ['amazon.com', 'github.com', 'google.com']

// Deployed Cloudflare Worker URL — env-overridable via VITE_API_BASE_URL.
// Fallback to the Worker URL so the production bundle always hits the API.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://scam-checker-api.techgarg0.workers.dev/api'

// Canonical origin, no trailing slash. Must match the value vite.config.js
// bakes into index.html, robots.txt and sitemap.xml — set VITE_SITE_URL once
// and every surface follows. Hardcoding a domain in markup is what left the
// canonical pointing at a domain that does not resolve.
const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://riocloud.dpdns.org').replace(/\/+$/, '')

const PENALTY = { dangerous: 35, warning: 15 }
const ASSESSED = new Set(['safe', 'warning', 'dangerous'])

/**
 * "unknown"/"error" mean a check could not run — that is absence of evidence,
 * not evidence of risk. Penalising them docked every site for our own upstream
 * being unavailable (a missing API key cost a legitimate site 10 points). Score
 * only the checks that actually returned a verdict, and report coverage next to
 * the score rather than extrapolating from what was never measured.
 */
function getScore(checks) {
  const assessed = checks.filter((c) => ASSESSED.has(c.status))
  if (assessed.length === 0) return null
  return Math.max(5, 100 - assessed.reduce((sum, c) => sum + (PENALTY[c.status] ?? 0), 0))
}

function getCoverage(checks) {
  return { assessed: checks.filter((c) => ASSESSED.has(c.status)).length, total: checks.length }
}

const UNSCORED = {
  label: 'Not enough data',
  message: 'No check returned a verdict for this domain.',
  className: 'border-hairline bg-surface text-muted',
  icon: Info,
}

/**
 * Styling for the Worker's scored bands. The server owns the label and message
 * (it has the evidence); the client only supplies colour and icon.
 *
 * UNPROVEN is the important addition: "we have no track record for this site"
 * used to share a bucket with "we have evidence against this site". Those are
 * different claims and users act on them differently.
 */
const BAND_STYLE = {
  CLEAN: { className: 'border-success/35 bg-success/10 text-success', icon: ShieldCheck },
  NO_ISSUES: { className: 'border-success/35 bg-success/10 text-success', icon: ShieldCheck },
  UNPROVEN: { className: 'border-warning/35 bg-warning/10 text-warning', icon: AlertTriangle },
  LIKELY_UNSAFE: { className: 'border-danger/35 bg-danger/10 text-danger', icon: ShieldAlert },
  HIGH_RISK: { className: 'border-danger/35 bg-danger/10 text-danger', icon: ShieldAlert },
  UNRESOLVED: { className: 'border-hairline bg-surface text-muted', icon: Info },
}

// Legacy path: responses cached before the Worker began sending `trust`.
function scorePresentation(score) {
  if (score < 50) return { label: 'High Risk', message: 'Multiple signals need your attention.', className: 'border-danger/35 bg-danger/10 text-danger', icon: ShieldAlert }
  if (score < 80) return { label: 'Use Caution', message: 'Review the findings before you continue.', className: 'border-warning/35 bg-warning/10 text-warning', icon: AlertTriangle }
  return { label: 'Low Risk', message: 'No high-risk signal was found in this scan.', className: 'border-success/35 bg-success/10 text-success', icon: ShieldCheck }
}

function StatusIcon({ status, className = 'size-5' }) {
  if (status === 'safe') return <CheckCircle2 className={`${className} text-success`} aria-hidden="true" />
  if (status === 'warning') return <AlertTriangle className={`${className} text-warning`} aria-hidden="true" />
  if (status === 'dangerous') return <XCircle className={`${className} text-danger`} aria-hidden="true" />
  return <Info className={`${className} text-muted`} aria-hidden="true" />
}

/**
 * Field rendering rules per check type. Renders `details` as a list of labeled rows.
 * Falls back to a JSON dump when no rule matches — but we always try the explicit rules first
 * so the user sees structured info (age, registrar, issuer, etc.).
 */
const FIELD_RENDERERS = {
  domain: (d) => {
    if (!d || typeof d === 'string') return [{ label: 'Result', value: d || 'No data' }]
    return [
      { label: 'Registered', value: d.registeredDate, mono: true },
      { label: 'Expires', value: d.expiresDate, mono: true },
      { label: 'Age', value: d.ageYears, accent: 'brand' },
      { label: 'Risk Level', value: d.riskLevel, accent: 'risk' },
      { label: 'Registrar', value: d.registrar },
      { label: 'Data Source', value: d.source, mono: true, small: true },
    ].filter(f => f.value != null && f.value !== '')
  },

  ssl: (d) => {
    if (!d || typeof d === 'string') return [{ label: 'Result', value: d || 'No data' }]
    return [
      // d.valid is a boolean `false` when no cert was found, which rendered as
      // the bare word "false" — on exactly the sites where the reason matters.
      { label: 'Status', value: d.valid === false ? 'No (no valid certificate)' : d.valid, accent: 'ssl' },
      { label: 'Issued To', value: d.issuedTo, mono: true },
      { label: 'Issuer', value: d.issuer },
      { label: 'Valid From', value: d.validFrom, mono: true },
      { label: 'Valid To', value: d.validTo, mono: true },
      { label: 'Days Remaining', value: d.daysUntilExpiry, accent: 'days' },
      ...(d.protocol ? [{ label: 'Protocol', value: d.protocol }] : []),
      ...(d.cipher ? [{ label: 'Cipher', value: d.cipher, mono: true }] : []),
      // These carry the explanation and were being dropped entirely.
      ...(d.error ? [{ label: 'Details', value: d.error }] : []),
      ...(d.note ? [{ label: 'Note', value: d.note, small: true }] : []),
      ...(d.source ? [{ label: 'Source', value: d.source, mono: true, small: true }] : []),
    ].filter(f => f.value != null && f.value !== '')
  },

  dns: (d) => {
    if (!d || typeof d === 'string') return [{ label: 'Result', value: d || 'No data' }]
    const rows = [
      { label: 'IPv4 (A)', value: d.aRecords, list: true, mono: true },
      { label: 'IPv6 (AAAA)', value: d.aaaaRecords, list: true, mono: true },
      { label: 'Mail (MX)', value: d.mxRecords, list: true, mono: true },
      { label: 'Nameservers', value: d.nameServers, list: true, mono: true },
      { label: 'SPF Record', value: d.spfConfigured, accent: 'flag' },
      { label: 'DMARC Record', value: d.dmarcConfigured, accent: 'flag' },
      { label: 'CAA Records', value: d.caaRecords, list: true, mono: true },
    ].filter(f => f.value != null && !(Array.isArray(f.value) && f.value.length === 0))

    if (d.securitySummary) rows.push({ label: 'Security', value: d.securitySummary, accent: 'summary' })
    if (Array.isArray(d.securityFlags) && d.securityFlags.length > 0) {
      rows.push({ label: 'Flags', value: d.securityFlags, list: true, accent: 'flag' })
    }
    return rows
  },

  reputation: (d) => {
    if (!d || typeof d === 'string') return [{ label: 'Result', value: d || 'No data' }]
    const rows = [
      { label: 'Databases Checked', value: d.databasesChecked },
      { label: 'Threats Detected', value: d.threatsDetected, accent: 'count' },
    ]
    if (Array.isArray(d.results)) {
      d.results.forEach((r) => {
        rows.push({
          label: r.name,
          value: r.clean ? `✓ ${r.details || 'Clean'}` : `⚠ ${r.details || 'Flagged'}`,
          accent: r.clean ? 'good' : 'bad',
        })
      })
    }
    if (d.openPhishFeed) {
      rows.push({
        label: 'OpenPhish feed',
        value: `${d.openPhishFeed.entries || 0} entries, last updated ${d.openPhishFeed.ageSeconds != null ? Math.round(d.openPhishFeed.ageSeconds / 60) + 'm ago' : 'never'}`,
        small: true,
        mono: true,
      })
    }
    return rows
  },

  reddit: (d) => {
    if (!d || typeof d === 'string') return [{ label: 'Result', value: d || 'No data' }]
    const rows = [
      { label: 'Discussions', value: d.totalDiscussions },
      { label: 'Scam Warnings', value: d.scamWarnings, accent: 'count' },
      { label: 'Caution Notes', value: d.cautionNotes, accent: 'count' },
      { label: 'Positive Mentions', value: d.positiveMentions, accent: 'good' },
    ]
    if (Array.isArray(d.recentPosts) && d.recentPosts.length > 0) {
      d.recentPosts.slice(0, 5).forEach((p) => {
        rows.push({
          label: p.subreddit || 'r/all',
          value: `${p.title}${p.score != null ? ` • ${p.score} pts` : ''}${p.created ? ` • ${p.created}` : ''}`,
          accent: 'post',
          postUrl: p.url,
        })
      })
    }
    return rows.filter(f => f.value != null && f.value !== '')
  },

  google: (d) => {
    if (!d || typeof d === 'string') return [{ label: 'Result', value: d || 'No data' }]
    const rows = [
      { label: 'Web Results', value: d.totalResults },
      { label: 'Scam Warnings', value: d.scamWarnings, accent: 'count' },
      { label: 'Caution Flags', value: d.cautionFlags, accent: 'count' },
      { label: 'Positive Reviews', value: d.positiveReviews, accent: 'good' },
    ]
    if (Array.isArray(d.topWebResults) && d.topWebResults.length > 0) {
      d.topWebResults.slice(0, 4).forEach((r) => {
        rows.push({
          label: r.title ? r.title.slice(0, 60) + (r.title.length > 60 ? '…' : '') : 'Result',
          value: r.snippet ? r.snippet.slice(0, 140) + (r.snippet.length > 140 ? '…' : '') : '',
          postUrl: r.url,
        })
      })
    }
    return rows.filter(f => f.value != null && f.value !== '')
  },
}

function FieldValue({ value, accent, list, mono, small }) {
  if (value == null || value === '') return null

  const classes = ['text-sm leading-5 sm:leading-6']
  if (mono) classes.push('font-mono text-xs')
  if (small) classes.push('text-xs text-muted')

  if (list && Array.isArray(value)) {
    return (
      <ul className="m-0 list-none space-y-1 p-0">
        {value.map((v, i) => (
          <li key={i} className={classes.join(' ') + ' break-words'}>{String(v)}</li>
        ))}
      </ul>
    )
  }

  let text = String(value)
  if (accent === 'risk') {
    if (/VERY HIGH/.test(text)) classes.push('font-semibold text-danger')
    else if (/HIGH/.test(text)) classes.push('font-semibold text-danger')
    else if (/MEDIUM/.test(text)) classes.push('font-semibold text-warning')
    else classes.push('font-semibold text-success')
  } else if (accent === 'flag') {
    classes.push(text === 'Yes' ? 'text-success' : 'text-warning')
  } else if (accent === 'good') {
    classes.push(Number(value) > 0 ? 'text-success' : 'text-muted')
  } else if (accent === 'count') {
    classes.push(Number(value) > 0 ? 'font-semibold text-warning' : 'text-muted')
  } else if (accent === 'ssl') {
    classes.push(/^Yes/.test(text) ? 'font-semibold text-success' : /expir/i.test(text) ? 'font-semibold text-warning' : 'font-semibold text-danger')
  } else if (accent === 'days') {
    const m = text.match(/(-?\d+)\s*days/)
    if (m) {
      const n = parseInt(m[1], 10)
      classes.push(n < 0 ? 'font-semibold text-danger' : n < 30 ? 'font-semibold text-warning' : 'text-ink')
    }
  } else if (accent === 'summary') {
    classes.push(text.includes('All') ? 'text-success' : 'text-warning')
  }

  return <span className={classes.join(' ')}>{text}</span>
}

function ResultCard({ check, expanded, onToggle }) {
  // Prefer the structured renderer; fall back to a JSON dump when no rule matches.
  const renderer = FIELD_RENDERERS[check.id]
  const structured = renderer ? renderer(check.details) : null
  const hasStructured = structured && structured.length > 0

  return (
    <article className="rounded-xl border border-hairline bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-ink">{check.name}</h3>
          <p className="mt-1 text-sm leading-5 text-muted">{check.description}</p>
        </div>
        <StatusIcon status={check.status} />
      </div>

      {check.error && (
        <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {check.error}
        </p>
      )}

      {hasStructured && (
        <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-hairline pt-3 sm:grid-cols-2">
          {structured.map((row, i) => (
            <div key={i} className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{row.label}</p>
              <div className="mt-1">
                {row.postUrl ? (
                  <a
                    href={row.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-1.5 break-words text-sm leading-5 text-ink transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="min-w-0 break-words">{row.value}</span>
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted" aria-hidden="true" />
                  </a>
                ) : (
                  <FieldValue value={row.value} accent={row.accent} list={row.list} mono={row.mono} small={row.small} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasStructured && check.details && typeof check.details === 'object' && (
        <details className="mt-4 border-t border-hairline pt-3">
          <summary className="cursor-pointer text-sm font-medium text-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
            Scan details
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-hairline bg-canvas-subtle p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-muted">
            {JSON.stringify(check.details, null, 2)}
          </pre>
        </details>
      )}

      {check.links?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
          {check.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand/35 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              {link.label}
            </a>
          ))}
        </div>
      )}
    </article>
  )
}


function BrandMark() {
  return (
    <a href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-ink" translate="no">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-blue-700 shadow-sm">
        <ShieldCheck className="size-4 text-white" aria-hidden="true" />
      </span>
      <span className="text-sm sm:text-base">Scam<span className="text-brand">Checker</span></span>
    </a>
  )
}

function SiteHeader({ theme, setTheme }) {
  return (
    <header className="border-b border-hairline bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <BrandMark />
        <button
          type="button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="grid size-9 place-items-center rounded-md border border-hairline bg-surface text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {theme === 'dark' ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-canvas px-4 py-6 text-sm text-muted">
      <div className="mx-auto max-w-6xl space-y-4">
        <nav aria-label="Footer" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-x-6 sm:gap-y-2">
          <a className="flex items-center gap-1.5 rounded-md py-1 hover:text-ink transition-colors" href="/guides/">Blog</a>
          <a className="flex items-center gap-1.5 rounded-md py-1 hover:text-ink transition-colors" href="/about/">About us</a>
          <a className="flex items-center gap-1.5 rounded-md py-1 hover:text-ink transition-colors" href="/privacy/">Privacy policy</a>
          <a className="flex items-center gap-1.5 rounded-md py-1 hover:text-ink transition-colors" href="/terms/">Terms &amp; conditions</a>
          <a className="flex items-center gap-1.5 rounded-md py-1 hover:text-ink transition-colors" href="/contact/">Contact us</a>
        </nav>
        <div className="border-t border-hairline pt-4">
          <p className="text-xs leading-5">Built to help you pause, verify, and browse more safely. Results are automated signals — not a legal verdict. Always verify independently before sharing personal or financial information.</p>
        </div>
      </div>
    </footer>
  )
}

/**
 * Contact form. Posts natively (no fetch, no JS) to the shared RioCloud lead
 * worker, which relays to info@riocloudsolutions.com over SMTP. A native form
 * POST is not subject to CORS, so this works from any static origin.
 *
 * `website` is a honeypot — bots fill it and the worker discards the message.
 */
function LeadForm() {
  const field =
    'mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-ink ' +
    'outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand'
  return (
    <form method="POST" action="https://dentistseo.dpdns.org/api/lead" className="mt-10">
      <input type="hidden" name="site" value={SITE_URL} />
      <input type="hidden" name="redirect" value={`${SITE_URL}/thank-you/`} />
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label>Leave this field empty<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <h2 className="text-lg font-semibold tracking-tight">Send us a message</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="lf-name">Your name</label>
          <input className={field} id="lf-name" name="name" type="text" required autoComplete="name" />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lf-email">Email</label>
          <input className={field} id="lf-email" name="email" type="email" required autoComplete="email" />
        </div>
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium" htmlFor="lf-message">How can we help?</label>
        <textarea className={field} id="lf-message" name="message" rows={5} required />
      </div>
      <button type="submit" className="mt-5 inline-flex rounded-lg bg-ink px-5 py-3 text-sm font-medium text-on-primary hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        Send message
      </button>
      <p className="mt-3 text-sm text-muted">
        Your details go only to our team — never sold, never added to a marketing list.
        See the <a className="underline" href="/privacy/">privacy policy</a>.
      </p>
    </form>
  )
}

function InfoPage({ kind, theme, setTheme }) {
  const content = PAGE_CONTENT[kind]

  // index.html ships the homepage's title, description and canonical. Without
  // this, all six routes would serve those same tags and read to a crawler as
  // duplicates of the homepage.
  useEffect(() => {
    const meta = ROUTE_META[kind]
    if (!meta) return

    document.title = meta.title

    const setTag = (selector, create, value) => {
      let el = document.head.querySelector(selector)
      if (!el) {
        el = create()
        document.head.appendChild(el)
      }
      el.setAttribute(el.tagName === 'LINK' ? 'href' : 'content', value)
    }

    setTag('meta[name="description"]', () => {
      const el = document.createElement('meta')
      el.setAttribute('name', 'description')
      return el
    }, meta.description)

    setTag('link[rel="canonical"]', () => {
      const el = document.createElement('link')
      el.setAttribute('rel', 'canonical')
      return el
    }, `${SITE_URL}/${kind}/`)

    // Error pages must never be indexed, whatever robots.txt says — a soft 404
    // that ranks is worse than one that does not exist.
    if (kind === '404' || kind === '500') {
      setTag('meta[name="robots"]', () => {
        const el = document.createElement('meta')
        el.setAttribute('name', 'robots')
        return el
      }, 'noindex, follow')
    }
  }, [kind])

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader theme={theme} setTheme={setTheme} />
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-brand">{content.eyebrow}</p>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">{content.title}</h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted">{content.intro}</p>
        <div className="mt-12 divide-y divide-hairline border-y border-hairline">
          {content.sections.map(([heading, body]) => (
            <section key={heading} className="py-7">
              <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
              <p className="mt-3 leading-7 text-muted">{body}</p>
            </section>
          ))}
        </div>
        {kind === 'contact' && <LeadForm />}
        {(kind === '404' || kind === '500') && (
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/" className="inline-flex rounded-lg bg-ink px-5 py-3 text-sm font-medium text-on-primary hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              ← Back to home
            </a>
            <a href="/contact/" className="inline-flex rounded-lg border border-hairline bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              Report this issue
            </a>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}


export default function App() {
  const [url, setUrl] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState('idle') // idle | partial | complete
  const resultsRef = useRef(null)
  const [seoExpanded, setSeoExpanded] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

  // Track the in-flight XHR so we can cancel it when the user submits another query.
  const xhrRef = useRef(null)
  const seqRef = useRef(0) // monotonically increasing request id

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (results && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [results])

  /**
   * Cancel any in-flight check, then start a new one with an incremented
   * sequence number. Out-of-order SSE events from the previous request are
   * ignored — the only writer that wins is the latest sequence id.
   */
  async function runCheck(value) {
    const target = (value || '').trim()
    if (!target) return

    // Abort the previous request (if any)
    if (xhrRef.current) {
      try { xhrRef.current.abort() } catch {}
      xhrRef.current = null
    }

    const seq = ++seqRef.current
    setLoading(true)
    setError('')
    setResults(null)
    setStage('partial')

    const payload = JSON.stringify({ url: target })

    // Try streaming first — fastest UX.
    const streamed = await streamCheck(payload, seq)
    if (streamed) {
      // The only setLoading(false) used to live in the fallback's finally
      // block, which this early return skips — so the spinner ran forever on
      // every successful scan.
      if (seqRef.current === seq) setLoading(false)
      return
    }

    // Fallback: single-shot JSON. Used only when the SSE stream fails to
    // open (network errors, CORS misconfig, etc.). Note: even the fallback
    // honours the `seq` so a stale response can't overwrite a newer one.
    try {
      const r = await fetch(`${API_BASE}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(20000), // else this path could hang unbounded
      })
      if (seqRef.current !== seq) return // user already moved on
      if (!r.ok) throw new Error('The safety check could not be completed.')
      const data = await r.json()
      const checks = data.checks.map((check) => ({ ...CHECK_TYPES.find((item) => item.id === check.id), ...check }))
      setResults({ domain: data.domain, checks, timestamp: data.timestamp })
      setStage('complete')
    } catch (e) {
      if (seqRef.current !== seq) return
      setError(e?.message?.includes('aborted') ? '' : "Couldn't check that website. Confirm the address and try again.")
    } finally {
      if (seqRef.current === seq) setLoading(false)
    }
  }

  function streamCheck(payload, seq) {
    return new Promise((resolve) => {
      let settled = false
      let consumed = 0 // chars of responseText already dispatched
      const finish = (ok) => {
        if (settled) return
        settled = true
        xhrRef.current = null
        resolve(Boolean(ok))
      }

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      xhr.open('POST', `${API_BASE}/check`)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.setRequestHeader('Accept', 'text/event-stream')
      xhr.timeout = 15000 // safety net

      // responseText is cumulative, so track how much has already been
      // dispatched. Without this, every chunk re-applied all earlier events,
      // re-rendering the report and yanking the scroll position each time.
      const drain = (includeTrailing) => {
        const text = xhr.responseText
        if (!text || text.length <= consumed) return
        const events = text.slice(consumed).split('\n\n')
        // The final segment is incomplete mid-stream; only take it on load.
        const upTo = includeTrailing ? events.length : events.length - 1
        for (let i = 0; i < upTo; i++) {
          consumed += events[i].length + 2
          const ev = events[i].trim()
          if (!ev) continue
          const eventMatch = ev.match(/^event: (\w+)\ndata: (.+)$/s)
          if (!eventMatch) continue
          let data
          try { data = JSON.parse(eventMatch[2]) } catch { continue }
          applyEvent(eventMatch[1], data)
        }
      }

      xhr.onreadystatechange = () => {
        if (seqRef.current !== seq) return // stale request — drop it
        if (xhr.readyState !== 3 && xhr.readyState !== 4) return
        drain(false)
      }

      xhr.onerror = () => finish(false)
      xhr.ontimeout = () => finish(false)
      xhr.onload = () => {
        if (seqRef.current !== seq) return
        // A 4xx/5xx still fires onload — the worker returns plain JSON errors
        // even when SSE was requested. Treat any non-2xx as a stream failure so
        // the caller falls through to the JSON path instead of hanging.
        if (xhr.status < 200 || xhr.status >= 300) return finish(false)
        drain(true)
        // If the stream ended without a `done` event (truncated response, CPU
        // limit), this resolves false and the fallback runs. No-op if `done`
        // already finished us.
        finish(false)
      }

      function applyEvent(eventName, data) {
        if (eventName === 'start') return
        // The `error` event carries { error } and no checks array. Guard the
        // shape — letting .map throw inside an XHR handler escapes the
        // promise and leaves the request unsettled forever.
        if (eventName === 'error' || !Array.isArray(data?.checks)) return finish(false)

        const checks = data.checks.map((check) => ({
          ...CHECK_TYPES.find((item) => item.id === check.id),
          ...check,
        }))
        setResults({ domain: data.domain, checks, timestamp: data.timestamp })
        if (eventName === 'core') setStage('partial')
        if (eventName === 'done') {
          setStage('complete')
          finish(true)
        }
      }

      xhr.send(payload)
    })
  }

  function handleSubmit(event) {
    event.preventDefault()
    runCheck(url)
  }

  // The Worker scores server-side now, where the raw evidence lives. Fall back
  // to the old client-side model only for cached responses that predate it.
  const trust = results?.trust ?? null
  const score = trust ? trust.score : results ? getScore(results.checks) : null
  const coverage = trust ? null : results ? getCoverage(results.checks) : null
  const presentation = !results
    ? null
    : trust
      ? { label: trust.label, message: trust.message, ...(BAND_STYLE[trust.band] ?? BAND_STYLE.UNRESOLVED) }
      : score !== null
        ? scorePresentation(score)
        : UNSCORED
  const VerdictIcon = presentation?.icon
  const page = window.location.pathname.replace(/^\/+|\/+$/g, '')
  // Anything that is not the homepage and not a known route renders the 404
  // page. This is what makes dist/404.html — which Cloudflare serves with a
  // real 404 status for unmatched paths — show the error page rather than a
  // copy of the homepage.
  if (page !== '') {
    return <InfoPage kind={PAGE_ROUTES.includes(page) ? page : '404'} theme={theme} setTheme={setTheme} />
  }

  return (
    // overflow-x:clip, not hidden — `hidden` forces overflow-y to auto, making
    // this a scroll container, which silently breaks the sticky header below.
    <div className="min-h-screen [overflow-x:clip] bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-on-primary">Skip to content</a>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandMark />
          <nav className="flex items-center gap-1 sm:gap-3">
            <a href="/how-it-works/" className="hidden rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-ink sm:inline-flex">How it works</a>
            <a href="/guides/" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-ink">Blog</a>
            <a href="/contact/" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-ink">Contact</a>
            <a href="#main" className="hidden rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-ink sm:inline-flex">Check a site</a>
            <span className="hidden h-4 w-px bg-hairline sm:block" />
            <span className="hidden rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success sm:inline-flex">Free Tool</span>
            <button type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="grid size-8 place-items-center rounded-lg border border-hairline bg-surface text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {theme === 'dark' ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
            </button>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ── HERO ── */}
        <section className="mesh relative isolate overflow-hidden border-b border-hairline px-4 py-8 sm:px-8 sm:py-16">
          <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 -z-10 h-full opacity-50" />
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-3xl font-bold tracking-[-0.04em] text-ink sm:text-4xl lg:text-5xl xl:text-[3.25rem]">
              Is This Website a Scam or Legit?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted">
              Our free <strong className="font-semibold text-ink">scam website checker</strong> analyses domain age, SSL, DNS, reputation databases, Reddit reports, and threat intelligence — in one instant scan.
            </p>

            <div className="mt-6 hidden flex-wrap justify-center gap-2 sm:flex">
              {[
                { icon: Calendar, label: 'Domain Age' },
                { icon: LockKeyhole, label: 'SSL Check' },
                { icon: Database, label: 'Threat Intel' },
                { icon: Globe2, label: 'DNS Security' },
                { icon: MessageSquare, label: 'Reddit' },
                { icon: Search, label: 'Web Reputation' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-medium text-muted">
                  <Icon className="size-3 text-brand" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>

            {/* Search form */}
            <form onSubmit={handleSubmit} className="mx-auto mt-8 max-w-2xl">
              <label htmlFor="website-url" className="sr-only">Website address</label>
              <div className="flex flex-col gap-2 rounded-2xl border border-hairline bg-surface p-2 shadow-[0_8px_32px_rgb(0_0_0_/_0.08)] transition-all duration-200 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
                  <Globe2 className="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <input
                    id="website-url"
                    name="website"
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck="false"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'website-error' : undefined}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="Enter a website, e.g. example.com…"
                    className="min-w-0 flex-1 bg-transparent py-3 text-base text-ink outline-none placeholder:text-muted"
                  />
                </div>
                <button type="submit" disabled={!url.trim()} className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-blue-700 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      {stage === 'partial' && results ? 'Refining…' : 'Checking…'}
                    </>
                  ) : (
                    <><Search className="size-4" aria-hidden="true" />Check Website</>
                  )}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
                <span>Try:</span>
                {EXAMPLES.map((domain) => (
                  <button key={domain} type="button" onClick={() => { setUrl(domain); runCheck(domain) }} className="rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-ink transition-colors hover:border-brand/40 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{domain}</button>
                ))}
              </div>
              {error && <p id="website-error" role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-left text-sm text-danger"><AlertCircle className="size-4 shrink-0" aria-hidden="true" />{error}</p>}
            </form>
          </div>
        </section>

        {/* Screen-reader announcement: one short sentence per scan, instead of
            the entire six-check report being re-read on every state update. */}
        <p role="status" className="sr-only">
          {loading
            ? 'Checking website…'
            : results && presentation
              ? `Scan complete for ${results.domain}. ${presentation.label}.${score !== null ? ` Trust score ${score} out of 100.` : ''}`
              : ''}
        </p>

        {/* ── RESULTS ── */}
        {/* No aria-live here: this subtree holds the whole report, so every
            update re-announced all six checks start to finish. The status node
            above carries the announcement instead. */}
        <section ref={resultsRef} className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-10 scroll-mt-4" aria-busy={loading}>
          {results ? (
            <>
              <div className={`rounded-2xl border p-4 sm:p-6 ${presentation.className}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <VerdictIcon className="size-5" aria-hidden="true" />
                      {presentation.label}
                      {stage === 'partial' && (
                        <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                          <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
                          Refining
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 break-words text-xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">{results.domain}</h2>
                    <p className="mt-2 text-sm text-muted">{presentation.message} Checked {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(results.timestamp))}.</p>
                  </div>
                  <div className="shrink-0">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Trust score</p>
                    <p className="mt-1 text-4xl font-semibold tracking-[-0.06em] text-ink sm:text-5xl">{score ?? '—'}<span className="text-xl text-muted">/100</span></p>
                    {trust ? (
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                        {trust.confidence} confidence · {trust.sourcesUsed.length} source{trust.sourcesUsed.length === 1 ? '' : 's'}
                      </p>
                    ) : coverage && coverage.assessed < coverage.total ? (
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                        {coverage.assessed} of {coverage.total} checks completed
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Why this score — turns an unexplained number into something
                    the user can audit, and makes complaints actionable. */}
                {trust?.contributions?.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5 border-t border-current/15 pt-3">
                    {trust.contributions.map((c, i) => (
                      <li
                        key={i}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                          c.effect === 'risk'
                            ? 'bg-danger/10 text-danger'
                            : 'bg-success/10 text-success'
                        }`}
                      >
                        <span aria-hidden="true">{c.effect === 'risk' ? '▲' : '▼'}</span>
                        {c.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {results.checks.map((check) => (
                  <ResultCard key={check.id} check={check} />
                ))}
              </div>
              <aside className="mt-4 flex gap-2 rounded-xl border border-hairline bg-canvas-subtle p-3 text-xs leading-5 text-muted sm:text-sm sm:leading-6 sm:p-4">
                <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <p>These signals help you make a safer decision; they do not guarantee that a website is safe. Verify sensitive requests independently before sharing money, passwords, or personal information.</p>
              </aside>
            </>
          ) : (
            <div className="grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline grid-cols-1 sm:grid-cols-3">
              {CHECK_TYPES.slice(0, 3).map(({ id, name, description, icon: Icon }) => (
                <div key={id} className="bg-surface p-4 sm:p-6">
                  <Icon className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="mt-6 text-base font-semibold tracking-tight">{name}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── SEO / GUIDE SECTION ── */}
        <section className="mx-auto max-w-3xl border-t border-hairline px-4 py-0 sm:px-8" aria-labelledby="tool-guide-heading">
          <button
            type="button"
            onClick={() => setSeoExpanded(v => !v)}
            className="flex w-full items-center justify-between py-4 text-sm font-medium text-muted hover:text-ink transition-colors"
            aria-expanded={seoExpanded}
            aria-controls="tool-guide-panel"
          >
            <span>About this tool</span>
            <ChevronDown className={`size-4 transition-transform duration-200 ${seoExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {/* max-h-0 only clips visually — without aria-hidden/inert the whole
              guide is still read aloud and tabbable while collapsed. */}
          <div
            id="tool-guide-panel"
            aria-hidden={!seoExpanded}
            inert={seoExpanded ? undefined : ''}
            className={`prose prose-neutral max-w-none dark:prose-invert overflow-hidden transition-all duration-500 ${seoExpanded ? 'max-h-[9999px] pb-10 opacity-100' : 'max-h-0 opacity-0'}`}
          >
            <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-brand">Your guide to safer browsing</p>
            <h2 id="tool-guide-heading" className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink sm:text-3xl">The Best Free Scam Website Checker Online</h2>
            <p className="mt-3 text-sm leading-7 text-muted sm:text-base sm:leading-8">Every day, millions of people encounter unfamiliar links in emails, social media posts, search results, and messaging apps. Before you click, sign in, or pay, it pays to pause and ask: <strong>is this a scam website?</strong> Our <strong>scam website checker</strong> gives you a fast, free, evidence-based answer. Enter any domain or full URL and receive an instant multi-signal safety report - no account, no download, no fee.</p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink sm:mt-8 sm:text-xl">What Makes This the Best Scam Website Checker?</h3>
            <p className="mt-2 text-sm leading-7 text-muted sm:text-base sm:leading-8">Most tools give you a single score from a single database. Our <strong>best scam website checker</strong> runs six independent checks and shows each result transparently so you can see exactly why a site was flagged. We examine <strong>domain age and WHOIS history</strong> (newly registered domains are a common scam signal), validate the <strong>SSL certificate</strong> for proper encryption and issuer trust, inspect <strong>DNS security records</strong> including SPF and DMARC, query leading <strong>threat intelligence databases</strong> such as PhishTank, URLVoid, and VirusTotal, surface relevant <strong>Reddit community scam reports</strong>, and pull <strong>Google web reputation signals</strong> from search results. Together, these six layers give a far more reliable picture than any single check alone.</p>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink sm:mt-8 sm:text-xl">Free Scam Website Checker - No Strings Attached</h3>
            <p className="mt-2 text-sm leading-7 text-muted sm:text-base sm:leading-8">Our <strong>free scam website checker</strong> is available to anyone, anywhere, at no cost. There is no daily limit, no email wall, and no account required. Paste a link, hit Check Website, and your report is ready in seconds. Whether you use it once for a suspicious marketplace listing or dozens of times as a daily habit, the <strong>scam website checker free</strong> tier covers everything the tool offers - making it the most accessible <strong>online scam website checker</strong> available today.</p>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink sm:mt-8 sm:text-xl">Is This a Scam Website Checker or a Guarantee?</h3>
            <p className="mt-2 text-sm leading-7 text-muted sm:text-base sm:leading-8">A common question is: <strong>is it a scam website checker</strong> I can fully rely on? The honest answer is that it is an automated screening tool, not a legal verdict. It surfaces red flags quickly and explains each one. A low-risk score means none of the checks found a concern, but it cannot account for a brand-new scam not yet reported anywhere. Use it as a strong first filter - and when a site asks for payment details, passwords, or personal documents, always verify through an independent channel.</p>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink sm:mt-8 sm:text-xl">Scam Website Checker UK - Works for Any Domain</h3>
            <p className="mt-2 text-sm leading-7 text-muted sm:text-base sm:leading-8">Looking for a <strong>scam website checker UK</strong> for British retailers, investment platforms, or government lookalike sites? Our checks work on .co.uk, .uk, and all international top-level domains. The tool analyses technical signals and public reputation regardless of where the site is hosted or where you browse from.</p>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink sm:mt-8 sm:text-xl">Real or Scam Website Checker - How to Read Your Results</h3>
            <p className="mt-2 text-sm leading-7 text-muted sm:text-base sm:leading-8">Your report displays a <strong>Trust Score out of 100</strong> and a colour-coded verdict: Low Risk, Use Caution, or High Risk. Each of the six check cards shows a green, amber, or red status. Click any card to expand raw scan details and follow links to WHOIS lookups, SSL Labs, and VirusTotal. If two or more checks flag a concern, do not share personal or financial information with that site.</p>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink sm:mt-8 sm:text-xl">Scam Website Checker Reddit and Google - Combined in One Tool</h3>
            <p className="mt-2 text-sm leading-7 text-muted sm:text-base sm:leading-8">You may already search using a <strong>scam website checker Reddit</strong> query, or run a <strong>Google scam website checker</strong> search to find complaint threads. Our <strong>scam website checker tool</strong> does this automatically, combining community intelligence with technical checks. Reddit discussions often surface scam patterns months before formal databases catch up.</p>
            <p className="mt-4 text-sm leading-6 text-muted">Ready to verify a link? Paste any address into the <strong>scam website checker online</strong> tool above. It takes under 30 seconds to get a full report - and those 30 seconds could save you from a costly mistake.</p>

            <section className="mt-8 pt-6 border-t border-hairline" aria-labelledby="guides-heading">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-brand">From the blog</p>
              <h3 id="guides-heading" className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-ink sm:text-3xl">Guides to staying safe online</h3>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2" role="list">
                {GUIDE_LINKS.map((g) => (
                  <li key={g.slug} className="rounded-xl border border-hairline bg-surface p-4">
                    <a href={`/guides/${g.slug}/`} className="text-base font-semibold text-ink hover:text-brand">{g.title}</a>
                    <p className="mt-1 text-sm leading-6 text-muted">{g.description}</p>
                  </li>
                ))}
              </ul>
              <a href="/guides/" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">See all guides</a>
            </section>

            <section className="mt-8 pt-6 border-t border-hairline" aria-labelledby="faq-heading">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-brand">FAQ</p>
              <h3 id="faq-heading" className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-ink sm:text-3xl">Frequently Asked Questions</h3>
              <p className="mt-3 text-sm leading-7 text-muted sm:text-base sm:leading-8">The questions people ask us most often about checking websites for scams, phishing, and fraud.</p>
              <dl className="mt-4 divide-y divide-hairline" role="list">
                {HOME_FAQ.map(({ q, a }) => (
                  <div key={q} className="py-5">
                    <dt className="text-base font-semibold text-ink">{q}</dt>
                    <dd className="mt-2 text-sm leading-7 text-muted sm:text-base sm:leading-8">{a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </section>

      </main>

      <SiteFooter />

    </div>
  )
}