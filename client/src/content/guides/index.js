/**
 * The guide library.
 *
 * Each guide is a plain module exporting { slug, title, description, updated,
 * body }, where `body` is a trusted HTML string authored in this repo — not
 * user input, and never rendered through React. The build writes each one to a
 * real static file (see `seoFilesPlugin` in vite.config.js), so the prose is
 * present in the initial HTML rather than injected after hydration.
 *
 * That distinction is the whole point of this directory. The tool itself is a
 * client-rendered SPA whose served markup is an empty <div id="root">, which is
 * fine for an interactive tool and useless for indexable articles.
 *
 * Order here is the order shown on /guides/.
 */
import howToTell from './how-to-tell-if-a-website-is-a-scam.js'
import fakeStore from './how-to-spot-a-fake-online-store.js'
import phishing from './how-to-recognise-phishing-messages.js'
import lookalike from './lookalike-domains-and-typosquatting.js'
import domainAge from './what-domain-age-tells-you.js'
import padlock from './https-and-ssl-what-the-padlock-proves.js'
import payments from './safest-ways-to-pay-online.js'
import scammed from './what-to-do-if-you-have-been-scammed-online.js'

export const GUIDES = [
  howToTell,
  fakeStore,
  phishing,
  lookalike,
  domainAge,
  padlock,
  payments,
  scammed,
]

/** Rough reading time in minutes, from the rendered word count. */
export function readingTime(guide) {
  const words = guide.body.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 220))
}
