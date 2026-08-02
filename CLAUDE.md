# ScamChecker

A website safety checker — not a blog. Users paste a domain and get a trust score
built from WHOIS age, SSL/CT logs, DNS records, OpenPhish, Reddit discussion and
Google results.

Live: **https://riocloud.dpdns.org/**
Repo: `insanemr14-boop/scamchecker` · production branch: `main`

## Layout

```
client/   React 18 + Vite 5 + Tailwind 4 SPA          -> Cloudflare Pages
worker/   Cloudflare Worker API (the real backend)    -> Cloudflare Workers
server/   Express port of the same checks             -> local dev only, NOT deployed
```

`worker/checks/*` and `server/checks/*` are parallel implementations of the same
six checks. **A fix to a check must be applied to both** or local dev and
production will disagree.

## How the pieces talk

The client is fully static and calls the Worker cross-origin. The base URL is
`import.meta.env.VITE_API_BASE_URL`, falling back to the deployed Worker
(`client/src/App.jsx`). The Worker sends permissive CORS headers, so the two
never need to share a domain.

`POST /api/check` has two modes: plain JSON, or — when the request sends
`Accept: text/event-stream` — a staggered SSE stream that emits fast core checks
(domain/ssl/dns/reputation) before the slower community ones (reddit/google).

## Deploying

**Push to `main` = publish.** Cloudflare is connected directly to this GitHub
repo and builds it itself — there is no CI workflow in this repo, and none
should be added. Adding one would double-deploy.

Pages build settings (this is an npm-workspaces monorepo, so the defaults are
wrong):

| Setting                | Value                              |
|------------------------|------------------------------------|
| Production branch      | `main`                             |
| Framework preset       | None                               |
| Build command          | `npm run build`                    |
| Build output directory | `client/dist`                      |
| Root directory         | blank (`/`)                        |

The root `build` script builds **only** the client. It must stay that way:
`server/` has no build step, so chaining `npm run build --workspace=server`
onto it makes every Cloudflare build fail with `Missing script: "build"` —
after the client has already built successfully, which makes the log read as
though the client was at fault.

Pages environment variables:

- `NODE_VERSION` = `22`
- `VITE_API_BASE_URL` = the Worker's `/api` base URL

The Worker deploys separately via Workers Builds, also connected to this repo.
Its secrets (`SERPER_API_KEY`, `REDDIT_CLIENT_ID`, ...) are set once with
`wrangler secret put NAME` and persist across deploys. Never commit them.

## Search engine discovery

`robots.txt` and `sitemap.xml` are generated at build time from
`client/src/routes.js` — never hand-edit them in `dist/`.

**Google.** Sitemap submission is manual, in Search Console. Google retired its
`/ping?sitemap=` endpoint in 2023 (it returns 404), so there is no way to
notify it programmatically without Search Console API credentials, which this
project does not have. Verification is via the `google-site-verification` meta
tag in `client/index.html`.

**Bing and Copilot.** Wired up via IndexNow. The key is
`d91791147ffb5669548fb7fe3be6ec3c`, proven by the file of the same name in
`client/public/` — the file must keep matching the key or submissions 403.
Re-notify after a content change with:

```bash
curl -X POST https://api.indexnow.org/indexnow \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"host":"riocloud.dpdns.org",
       "key":"d91791147ffb5669548fb7fe3be6ec3c",
       "keyLocation":"https://riocloud.dpdns.org/d91791147ffb5669548fb7fe3be6ec3c.txt",
       "urlList":["https://riocloud.dpdns.org/"]}'
```

A 202 means accepted. This matters beyond Bing's own traffic: the Bing index is
what feeds Microsoft Copilot's citations.

**Known weakness.** Every `<lastmod>` is the build date, because the whole site
rebuilds on every push. Google treats an always-changing `lastmod` as noise and
starts ignoring it. Deriving each date from the last commit that touched the
relevant content would be more honest, but Cloudflare's shallow clone makes
per-file git history unreliable at build time.

## Building on this server

The shared host cannot give Tailwind 4's native Rust module a thread pool, so a
plain build dies with `ThreadPoolBuildError ... Resource temporarily unavailable`.
Pin it to one thread:

```bash
RAYON_NUM_THREADS=1 npm run build --workspace=client
```

Cloudflare's build runners are unaffected — this is a local-only workaround.
