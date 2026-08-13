import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INFO_ROUTES, ERROR_ROUTES, UTILITY_ROUTES, SITEMAP_ROUTES, ROUTE_META } from './src/routes.js'

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
      const urls = SITEMAP_ROUTES.map((route) => {
        // Trailing slash is not cosmetic. Each route is a directory index, and
        // Cloudflare 308s /about to /about/. Listing the unslashed form would
        // point both the sitemap and the canonical at a redirect.
        const loc = route === '' ? `${SITE_URL}/` : `${SITE_URL}/${route}/`
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
