import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INFO_ROUTES, ERROR_ROUTES, UTILITY_ROUTES, SITEMAP_ROUTES, ROUTE_META, GUIDE_INDEX_ROUTE } from './src/routes.js'
import { GUIDES, readingTime } from './src/content/guides/index.js'

/**
 * Canonical origin for this build, without a trailing slash.
 *
 * Everything that names the site — canonical, og:url, hreflang, JSON-LD,
 * sitemap entries, the robots.txt Sitemap line — derives from this one value.
 * Set VITE_SITE_URL in the Cloudflare Pages environment to move the site to a
 * new domain without touching any markup.
 */
const SITE_URL = (process.env.VITE_SITE_URL || 'https://riocloud.dpdns.org').replace(/\/+$/, '')

/** Substitutes the __SITE_URL__ placeholder throughout index.html. */
function siteUrlPlugin() {
  return {
    name: 'scamchecker-site-url',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('__SITE_URL__', SITE_URL),
    },
  }
}

/**
 * Emits the SEO and hosting files Cloudflare Pages needs.
 *
 * Generated rather than committed as static files so they cannot drift from
 * src/routes.js or from SITE_URL.
 */
function seoFilesPlugin() {
  return {
    name: 'scamchecker-seo-files',

    generateBundle() {
      const today = new Date().toISOString().slice(0, 10)

      // ── sitemap.xml ──
      // Guide articles are real files, not SPA routes, so they are appended
      // rather than living in SITEMAP_ROUTES.
      const guideUrls = GUIDES.map((g) => `/${GUIDE_INDEX_ROUTE}/${g.slug}`)

      const urls = [...SITEMAP_ROUTES, ...guideUrls].map((route) => {
        // Trailing slash is not cosmetic. Each route is a directory index, and
        // Cloudflare 308s /about to /about/. Listing the unslashed form would
        // point both the sitemap and the canonical at a redirect.
        const path = route.startsWith('/') ? route.slice(1) : route
        const loc = path === '' ? `${SITE_URL}/` : `${SITE_URL}/${path}/`
        // The homepage is the tool itself; the supporting pages are near-static.
        const priority = route === '' ? '1.0' : '0.6'
        const changefreq = route === '' ? 'daily' : 'monthly'
        return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
      }).join('\n')

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
      })

      // ── robots.txt ──
      // Deliberately does not block AI crawlers. The old template disallowed
      // GPTBot, ClaudeBot, PerplexityBot and CCBot, which is self-defeating for
      // a free tool that wants to be recommended — those crawlers feed the
      // assistants people now ask "is this website a scam?".
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          '# robots.txt — Scam Website Checker',
          '',
          'User-agent: *',
          'Allow: /',
          '',
          '# Synthetic error pages — never useful in search results.',
          ...ERROR_ROUTES.map((r) => `Disallow: /${r}`),
          ...UTILITY_ROUTES.map((r) => `Disallow: /${r}/`),
          '',
          '# The API lives on a separate Worker origin, but block the path anyway',
          '# in case it is ever proxied onto this domain.',
          'Disallow: /api/',
          '',
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          '',
        ].join('\n'),
      })

      // Deliberately no _redirects file. Rewriting /about to /index.html looks
      // right but does not work here: Cloudflare's html_handling normalises the
      // /index.html target back to /, so the rewrite is served as a 308 to the
      // homepage and the page becomes unreachable. Real files per route (see
      // writeBundle) avoid the rewrite layer altogether.
    },

    /**
     * Writes a real HTML file for every route: dist/about/index.html and so on,
     * plus dist/404.html.
     *
     * Each is the built SPA shell with its own <title>, description and
     * canonical substituted in, so those tags are present in the initial HTML
     * rather than injected by React after hydration — which is both better for
     * crawlers and what stops the five pages reading as duplicates of the
     * homepage.
     *
     * Serving real files also means Cloudflare answers /about with a plain 200
     * and still falls back to 404.html, with a genuine 404 status, for anything
     * it does not have a file for.
     *
     * Runs in writeBundle, not closeBundle: closeBundle also fires when the
     * build has failed, at which point dist/index.html does not exist and this
     * would throw an ENOENT that masks the real error.
     */
    writeBundle(options) {
      const dist = options.dir ?? resolve(dirname(fileURLToPath(import.meta.url)), 'dist')
      const shell = resolve(dist, 'index.html')
      if (!existsSync(shell)) return

      const html = readFileSync(shell, 'utf8')
      const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

      const render = (route) => {
        const meta = ROUTE_META[route]
        return html
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(meta.title)}</title>`)
          .replace(
            /<meta name="description" content="[^"]*"\s*\/?>/,
            `<meta name="description" content="${attr(meta.description)}" />`,
          )
          .replace(
            /<link rel="canonical" href="[^"]*"\s*\/?>/,
            `<link rel="canonical" href="${SITE_URL}/${route}/" />`,
          )
      }

      for (const route of INFO_ROUTES) {
        mkdirSync(resolve(dist, route), { recursive: true })
        writeFileSync(resolve(dist, route, 'index.html'), render(route))
      }

      for (const route of UTILITY_ROUTES) {
        mkdirSync(resolve(dist, route), { recursive: true })
        writeFileSync(
          resolve(dist, route, 'index.html'),
          render(route).replace(
            /<meta name="robots" content="[^"]*"\s*\/?>/,
            '<meta name="robots" content="noindex, follow" />',
          ),
        )
      }

      // ── guide library ──
      // These pages deliberately drop the SPA bundle. React mounts into #root
      // and would replace the prose with the tool; without the module script
      // the article is simply the page, which is the entire point of writing
      // them as files. The cost is that the header/footer here are static
      // markup mirroring App.jsx rather than the components themselves.
      const shellHead = html.slice(0, html.indexOf('</head>'))
      const cssHref = (shellHead.match(/href="(\/assets\/[^"]+\.css)"/) || [])[1] || ''

      const chrome = (bodyHtml) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
__HEAD__
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<meta name="google-adsense-account" content="ca-pub-2164822493055530" />
<script src="/consent.js" data-policy="/privacy/"></script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2164822493055530" crossorigin="anonymous"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-EW958DHTGX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-EW958DHTGX')</script>
<script>try{document.documentElement.dataset.theme=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}</script>
</head>
<body class="bg-canvas text-ink">
<header class="border-b border-hairline bg-canvas/90 backdrop-blur">
  <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
    <a href="/" class="text-sm font-semibold tracking-tight text-ink">Scam Website Checker</a>
    <nav class="flex items-center gap-4 text-sm text-muted">
      <a class="hover:text-ink" href="/${GUIDE_INDEX_ROUTE}/">Guides</a>
      <a class="hover:text-ink" href="/contact/">Contact</a>
      <a class="hover:text-ink" href="/">Check a site</a>
    </nav>
  </div>
</header>
${bodyHtml}
<footer class="border-t border-hairline bg-canvas px-4 py-6 text-sm text-muted">
  <div class="mx-auto max-w-6xl space-y-4">
    <nav aria-label="Footer" class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-x-6 sm:gap-y-2">
      <a class="py-1 hover:text-ink" href="/${GUIDE_INDEX_ROUTE}/">Guides</a>
      <a class="py-1 hover:text-ink" href="/about/">About us</a>
      <a class="py-1 hover:text-ink" href="/privacy/">Privacy policy</a>
      <a class="py-1 hover:text-ink" href="/terms/">Terms &amp; conditions</a>
      <a class="py-1 hover:text-ink" href="/contact/">Contact us</a>
    </nav>
    <div class="border-t border-hairline pt-4">
      <p class="text-xs leading-5">Built to help you pause, verify, and browse more safely. Results are automated signals — not a legal verdict. Always verify independently before sharing personal or financial information.</p>
    </div>
  </div>
</footer>
</body>
</html>
`

      // End-of-guide capture. Consumer readers are a poor commercial fit for
      // RioCloud, so this offers the business-facing service (domain and brand
      // monitoring) rather than pretending a consumer needs an agency. The tool
      // CTA stays alongside it, because that is the right next step for most
      // readers and burying it would trade a useful action for a rare lead.
      const leadForm = (slug) => `  <aside class="mt-12 rounded-lg border border-hairline bg-surface-raised p-5 sm:p-6">
    <p class="text-base font-semibold text-ink">Not sure about a specific website?</p>
    <p class="mt-1 text-sm leading-6 text-muted">Run it through the free checker — domain age, certificate, DNS and reputation listings in one pass.</p>
    <a href="/" class="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary">Check a website</a>
  </aside>
  <section class="mt-6 rounded-lg border border-hairline bg-surface p-5 sm:p-6">
    <h2 class="text-base font-semibold text-ink">Protecting a brand, not just a purchase?</h2>
    <p class="mt-1 text-sm leading-6 text-muted">If people are being scammed by sites impersonating <em>your</em> business, we monitor for lookalike domains and get them taken down. Tell us the brand and we will run a first sweep for free.</p>
    <form method="POST" action="https://dentistseo.dpdns.org/api/lead" class="mt-4">
      <input type="hidden" name="site" value="${SITE_URL}" />
      <input type="hidden" name="redirect" value="${SITE_URL}/thank-you/" />
      <input type="hidden" name="source" value="/${GUIDE_INDEX_ROUTE}/${slug}/" />
      <input type="hidden" name="subject" value="Brand protection enquiry — ${slug}" />
      <div style="position:absolute;left:-9999px" aria-hidden="true">
        <label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block text-sm font-medium text-ink">Your name
          <input class="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-ink" name="name" type="text" required autocomplete="name" />
        </label>
        <label class="block text-sm font-medium text-ink">Work email
          <input class="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-ink" name="email" type="email" required autocomplete="email" />
        </label>
      </div>
      <label class="mt-3 block text-sm font-medium text-ink">Which brand or domain?
        <input class="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-ink" name="message" type="text" required />
      </label>
      <button type="submit" class="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary">Request a free sweep</button>
      <p class="mt-2 text-xs leading-5 text-muted">A person reads it and replies. No newsletter. See the <a class="underline" href="/privacy/">privacy policy</a>.</p>
    </form>
  </section>`

      const head = (title, description, canonical, extra = '') =>
        `<title>${attr(title)}</title>
<meta name="description" content="${attr(description)}" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${attr(title)}" />
<meta property="og:description" content="${attr(description)}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary_large_image" />${extra}`

      // Article pages
      for (const g of GUIDES) {
        const canonical = `${SITE_URL}/${GUIDE_INDEX_ROUTE}/${g.slug}/`
        const jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.title,
          description: g.description,
          dateModified: g.updated,
          datePublished: g.updated,
          mainEntityOfPage: canonical,
          author: { '@type': 'Organization', name: 'Scam Website Checker' },
          publisher: {
            '@type': 'Organization',
            name: 'Scam Website Checker',
            url: `${SITE_URL}/`,
          },
        }
        const body = `<main class="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
  <nav aria-label="Breadcrumb" class="mb-6 text-sm text-muted">
    <a class="hover:text-ink" href="/">Home</a> <span aria-hidden="true">/</span>
    <a class="hover:text-ink" href="/${GUIDE_INDEX_ROUTE}/">Guides</a>
  </nav>
  <article class="guide-article">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">${attr(g.title)}</h1>
    <p class="mt-3 text-sm text-muted">Updated ${g.updated} · ${readingTime(g)} min read</p>
    ${g.body}
  </article>
${leadForm(g.slug)}
</main>`
        mkdirSync(resolve(dist, GUIDE_INDEX_ROUTE, g.slug), { recursive: true })
        writeFileSync(
          resolve(dist, GUIDE_INDEX_ROUTE, g.slug, 'index.html'),
          chrome(body).replace(
            '__HEAD__',
            head(g.title, g.description, canonical) +
              `\n<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
          ),
        )
      }

      // Index page
      const indexCanonical = `${SITE_URL}/${GUIDE_INDEX_ROUTE}/`
      const cards = GUIDES.map(
        (g) => `    <li class="rounded-lg border border-hairline bg-surface p-5">
      <h2 class="text-lg font-semibold leading-snug"><a class="text-ink hover:text-brand" href="/${GUIDE_INDEX_ROUTE}/${g.slug}/">${attr(g.title)}</a></h2>
      <p class="mt-2 text-sm leading-6 text-muted">${attr(g.description)}</p>
      <p class="mt-3 text-xs text-muted">${readingTime(g)} min read · updated ${g.updated}</p>
    </li>`,
      ).join('\n')
      const indexBody = `<main class="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
  <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Guides</h1>
  <p class="mt-3 max-w-2xl text-base leading-7 text-muted">Plain-English guides to checking whether a website is safe, recognising the common scam patterns, choosing payment methods you can reverse, and what to do if something has already gone wrong.</p>
  <ul class="mt-8 grid gap-4 sm:grid-cols-2">
${cards}
  </ul>
</main>`
      mkdirSync(resolve(dist, GUIDE_INDEX_ROUTE), { recursive: true })
      writeFileSync(
        resolve(dist, GUIDE_INDEX_ROUTE, 'index.html'),
        chrome(indexBody).replace(
          '__HEAD__',
          head(
            'Guides — Scam Website Checker',
            'Practical guides to spotting scam websites, fake online stores and phishing messages, choosing safer payment methods, and recovering after a scam.',
            indexCanonical,
          ),
        ),
      )

      // The 404 shell must never be indexable, whatever else happens.
      writeFileSync(
        resolve(dist, '404.html'),
        render('404').replace(
          /<meta name="robots" content="[^"]*"\s*\/?>/,
          '<meta name="robots" content="noindex, follow" />',
        ),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrlPlugin(), seoFilesPlugin()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
