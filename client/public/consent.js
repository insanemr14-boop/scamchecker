/**
 * Cookie consent banner + Google Consent Mode v2.
 *
 * One file, no dependencies, no build step — the same script is served by all
 * four sites, which run on three different stacks (Astro, a React SPA and a
 * static WordPress export). Anything site-specific is read from CSS custom
 * properties, so this file never needs a per-site copy.
 *
 * LOAD ORDER MATTERS. This must be a plain (non-async, non-defer) tag placed
 * *before* the gtag.js and adsbygoogle.js tags. Consent Mode only works if the
 * `default` command is already sitting in `dataLayer` when those libraries
 * initialise; arriving late means the first page view is measured under the
 * wrong consent state.
 *
 * Note this is NOT a substitute for a Google-certified CMP. Serving
 * personalised ads to EEA/UK traffic requires one of those, enabled from the
 * AdSense dashboard under Privacy & messaging. This handles the technical
 * signal plumbing and the non-EEA disclosure.
 */
(function () {
  'use strict';

  var KEY = 'cookie-consent-v1';
  // Site-specific, read from this tag's own data attribute exactly as ga.js does,
  // so the file itself stays byte-identical across all four sites.
  var self = document.currentScript;
  var POLICY_URL = (self && self.getAttribute('data-policy')) || '/privacy-policy/';

  // ---------------------------------------------------------------- dataLayer
  // Defined here rather than reusing a global: this file runs before gtag.js,
  // so window.gtag does not exist yet and we must not wait for it.
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }

  function signal(command, granted) {
    var v = granted ? 'granted' : 'denied';
    gtag('consent', command, {
      ad_storage: v,
      ad_user_data: v,
      ad_personalization: v,
      analytics_storage: v,
      functionality_storage: 'granted',
      security_storage: 'granted',
    });
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      return typeof v.granted === 'boolean' ? v : null;
    } catch (e) {
      // Private-mode or blocked storage. Treat as "no decision recorded" and
      // stay on the denied default rather than throwing.
      return null;
    }
  }

  function write(granted) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ granted: granted, at: new Date().toISOString() })
      );
    } catch (e) {
      /* nothing sensible to do; the denied default still applies next load */
    }
  }

  // ------------------------------------------------------------------ default
  // Denied until the visitor says otherwise. wait_for_update gives the stored
  // decision below a moment to land before any tag reports.
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  });

  var saved = read();
  if (saved) signal('update', saved.granted);

  // --------------------------------------------------------------------- CSS
  var CSS = [
    '.cc-banner{position:fixed;z-index:2147483000;left:0;right:0;bottom:0;',
    'display:flex;gap:1rem;flex-wrap:wrap;align-items:center;justify-content:center;',
    'padding:1rem 1.25rem;',
    'background:var(--cc-bg);color:var(--cc-fg);',
    'border-top:1px solid var(--cc-line);',
    'box-shadow:0 -4px 24px rgba(0,0,0,.12);',
    'font:400 .875rem/1.5 var(--font-sans,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);',
    'transform:translateY(0);transition:transform .25s ease}',
    '.cc-banner[hidden]{display:none}',
    '.cc-text{flex:1 1 22rem;max-width:56rem;margin:0}',
    '.cc-text a{color:var(--cc-link);text-decoration:underline}',
    '.cc-actions{display:flex;gap:.5rem;flex-wrap:wrap}',
    '.cc-btn{appearance:none;cursor:pointer;border-radius:.5rem;',
    'padding:.5rem 1rem;font-size:.875rem;font-weight:600;line-height:1.25;',
    'border:1px solid var(--cc-line);background:transparent;color:inherit}',
    '.cc-btn:hover{border-color:var(--cc-link)}',
    '.cc-btn--accept{background:var(--cc-link);border-color:var(--cc-link);color:var(--cc-on-link)}',
    '.cc-btn--accept:hover{filter:brightness(1.08)}',
    '.cc-btn:focus-visible{outline:2px solid var(--cc-link);outline-offset:2px}',
    // Light defaults, overridden below. --color-primary is picked up from the
    // host site's token set when it defines one.
    ':root{--cc-bg:#ffffff;--cc-fg:#171717;--cc-line:#e5e7eb;',
    '--cc-link:var(--color-primary,#0070f3);--cc-on-link:#ffffff}',
    '@media (prefers-color-scheme:dark){:root{--cc-bg:#111111;--cc-fg:#ededed;--cc-line:#2a2a2a}}',
    // The two Astro sites toggle dark mode with a class rather than the media
    // query, so honour that too.
    'html.dark,.dark{--cc-bg:#111111;--cc-fg:#ededed;--cc-line:#2a2a2a}',
    '@media (prefers-reduced-motion:reduce){.cc-banner{transition:none}}',
  ].join('');

  // ------------------------------------------------------------------- banner
  var banner = null;

  function decide(granted) {
    write(granted);
    signal('update', granted);
    if (banner) banner.hidden = true;
  }

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    banner = document.createElement('div');
    banner.className = 'cc-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.setAttribute('aria-live', 'polite');

    var p = document.createElement('p');
    p.className = 'cc-text';
    p.appendChild(
      document.createTextNode(
        'We use cookies to measure traffic and to show ads that help keep this ' +
          'site free. Decline and we keep only what the site needs to work. '
      )
    );
    var a = document.createElement('a');
    a.href = POLICY_URL;
    a.textContent = 'Privacy policy';
    p.appendChild(a);
    p.appendChild(document.createTextNode('.'));

    var actions = document.createElement('div');
    actions.className = 'cc-actions';

    var decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'cc-btn';
    decline.textContent = 'Decline';
    decline.addEventListener('click', function () {
      decide(false);
    });

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'cc-btn cc-btn--accept';
    accept.textContent = 'Accept';
    accept.addEventListener('click', function () {
      decide(true);
    });

    actions.appendChild(decline);
    actions.appendChild(accept);
    banner.appendChild(p);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    accept.focus();
  }

  function show() {
    if (banner) {
      banner.hidden = false;
      return;
    }
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);
  }

  /** Lets a footer link reopen the choice: <a href="#" onclick="openCookieSettings()">. */
  window.openCookieSettings = function () {
    show();
    return false;
  };

  if (!saved) show();
})();
