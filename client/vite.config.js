import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INFO_ROUTES, ERROR_ROUTES, SITEMAP_ROUTES } from './src/routes.js'

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
        const loc = route === '' ? `${SITE_URL}/` : `${SITE_URL}/${route}`
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
          '',
          '# The API lives on a separate Worker origin, but block the path anyway',
          '# in case it is ever proxied onto this domain.',
          'Disallow: /api/',
          '',
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          '',
        ].join('\n'),
      })

      // ── _redirects ──
      // Client-side routes need an explicit rewrite, or Cloudflare Pages looks
      // for /about/index.html, fails to find it, and serves a 404.
      //
      // This is an explicit list, not a catch-all `/* /index.html 200`. A
      // catch-all makes every wrong URL answer 200 — a soft 404. Unknown paths
      // instead fall through to 404.html and get a real 404 status.
      this.emitFile({
        type: 'asset',
        fileName: '_redirects',
        source: [
          '# Client-side routes → the SPA shell, served 200 so they index normally.',
          ...INFO_ROUTES.flatMap((r) => [
            `/${r}    /index.html   200`,
            `/${r}/   /index.html   200`,
          ]),
          '',
          '# Everything else falls through to 404.html with a genuine 404 status.',
          '',
        ].join('\n'),
      })
    },

    /**
     * Cloudflare Pages serves 404.html for unmatched paths with a real 404
     * status. Copying the built shell means React boots, sees a path it does
     * not recognise, and renders the 404 page.
     *
     * Runs in writeBundle, not closeBundle: closeBundle also fires when the
     * build has failed, at which point dist/index.html does not exist and the
     * copy throws, masking the real error with an ENOENT.
     */
    writeBundle(options) {
      const dist = options.dir ?? resolve(dirname(fileURLToPath(import.meta.url)), 'dist')
      const shell = resolve(dist, 'index.html')
      if (!existsSync(shell)) return
      copyFileSync(shell, resolve(dist, '404.html'))
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
