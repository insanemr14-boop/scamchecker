/**
 * The site's route table — the single source of truth.
 *
 * Imported by both `App.jsx` (to decide what to render) and `vite.config.js`
 * (to emit sitemap.xml and _redirects at build time). Keeping one list means a
 * new page cannot end up rendered-but-unlisted, or listed-but-unroutable.
 *
 * Plain `.js` with no JSX so the Vite config can import it directly.
 */

/** Real, indexable pages. Each renders through <InfoPage kind={...}>. */
export const INFO_ROUTES = ['about', 'privacy', 'terms', 'contact', 'how-it-works']

/**
 * Error pages. Routable so the app can render them, but deliberately kept out
 * of the sitemap and disallowed in robots.txt — a synthetic error page in the
 * index is wasted crawl budget at best.
 */
export const ERROR_ROUTES = ['404', '500']

/**
 * Routable but deliberately unlisted, like the error pages. /thank-you/ is the
 * post-submission landing page the shared lead worker redirects to; indexing it
 * would put a dead-end confirmation page in search results.
 */
export const UTILITY_ROUTES = ['thank-you']

/** Every path <InfoPage> knows how to render. */
export const PAGE_ROUTES = [...INFO_ROUTES, ...ERROR_ROUTES, ...UTILITY_ROUTES]

/**
 * The guide library index and its articles.
 *
 * These are NOT SPA routes. Each is written to a real static HTML file at build
 * time with its prose already in the markup, because the SPA shell serves an
 * empty <div id="root"> and an article nobody can read without executing
 * JavaScript is not much of an article. App.jsx never sees these paths — the
 * server answers them with their own files.
 *
 * Listed here anyway so the sitemap has one source of truth.
 */
export const GUIDE_INDEX_ROUTE = "guides"

/**
 * What belongs in sitemap.xml: the homepage plus the real pages.
 * `''` is the homepage.
 */
export const SITEMAP_ROUTES = ['', ...INFO_ROUTES, GUIDE_INDEX_ROUTE]

/**
 * Per-route <title> and meta description.
 *
 * The app is a single HTML file, so without this every route would inherit the
 * homepage's title and description — five URLs competing as duplicates. These
 * are applied client-side on mount; Google renders JS, so they are picked up.
 */
export const ROUTE_META = {
  '': {
    title: 'Scam Website Checker – Free Online Tool to Check If a Website Is Legit or a Scam',
    description:
      'Use our free scam website checker online to instantly check if a website is legit or a scam. Review domain age, SSL, DNS, reputation databases, Reddit reports, and threat intelligence in one scan. No sign-up required.',
  },
  about: {
    title: 'About Scam Website Checker – Who We Are and Why We Built This',
    description:
      'Learn who is behind Scam Website Checker, how the free website safety tool is funded, and the principles behind every scam check we run.',
  },
  privacy: {
    title: 'Privacy Policy – Scam Website Checker',
    description:
      'How Scam Website Checker handles your data: what we store when you scan a domain, what we never collect, and the third-party services involved.',
  },
  terms: {
    title: 'Terms & Conditions – Scam Website Checker',
    description:
      'The terms covering use of Scam Website Checker, including why scan results are an automated signal rather than a guarantee of a website’s safety.',
  },
  contact: {
    title: 'Contact Us – Report a False Positive or Send Feedback',
    description:
      'Get in touch with the Scam Website Checker team to report an incorrect result, flag a scam website, or send feedback about the free safety tool.',
  },
  'how-it-works': {
    title: 'How It Works – The 6 Checks Behind Every Scam Website Scan',
    description:
      'A walkthrough of the six signals Scam Website Checker analyses — domain age, SSL, DNS, threat databases, Reddit reports and web reputation — and how to read your trust score.',
  },
  404: {
    title: 'Page Not Found – Scam Website Checker',
    description: 'The page you were looking for does not exist. Return to the free scam website checker.',
  },
  500: {
    title: 'Something Went Wrong – Scam Website Checker',
    description: 'The server hit an unexpected error. Please try your scam website check again.',
  },
  'thank-you': {
    title: 'Thank You – Scam Website Checker',
    description: 'Your message has been received. The RioCloud Solutions team will get back to you shortly.',
  },
}
