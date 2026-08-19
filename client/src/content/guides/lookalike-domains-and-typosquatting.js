export default {
  slug: 'lookalike-domains-and-typosquatting',
  title: 'Lookalike Domains: How Scammers Copy a Web Address You Trust',
  description:
    'Typosquatting, homoglyph attacks, subdomain tricks and new extensions — the techniques used to build a web address that reads as a brand you know, and how to read a domain correctly.',
  updated: '2026-08-19',
  body: `
<p class="lead">The most effective phishing does not rely on a convincing page. Copying a page is trivial — the HTML is right there. What the attacker actually needs is a web address that survives a glance.</p>

<p>That is a harder problem, and there is a well-developed toolkit for solving it. Knowing the techniques is what turns a glance into a reliable check.</p>

<h2>First: how to read a domain name</h2>

<p>Almost every trick below works because people read web addresses left to right, like a sentence. Domains do not work that way.</p>

<p>The part that determines who controls a site is the <strong>registered domain</strong>: the label immediately to the left of the extension, plus the extension. Read from the right, find the extension, take one label to its left. That is the owner. Everything to the <em>left</em> of that is subdomain text, which the owner chooses freely and can set to anything at all.</p>

<p>So in <code>www.paypal.com.account-verify.xyz</code>, the registered domain is <code>account-verify.xyz</code>. The words <code>paypal</code> and <code>com</code> are just subdomain labels the attacker typed. The site has no connection to PayPal whatsoever.</p>

<p>Once you read from the right, most of these attacks fail immediately.</p>

<h2>The techniques</h2>

<h3>Typosquatting</h3>

<p>Registering the domains people reach by mistyping: a doubled letter, a missing letter, transposed characters, a nearby key. <code>gogle.com</code>, <code>amazom.com</code>, <code>micosoft.com</code>.</p>

<p>These harvest traffic passively — no message needs to be sent, people simply arrive. Major brands defensively register the obvious variants, but the space is combinatorially large and cannot be covered completely.</p>

<h3>Homoglyph and internationalised domain attacks</h3>

<p>The most visually deceptive class, because the address can be genuinely indistinguishable.</p>

<p>Many characters from other alphabets render identically or near-identically to Latin ones. Cyrillic "а" is a different character from Latin "a" but looks the same in most fonts. A domain using it is a completely different address that displays identically.</p>

<p>Browsers defend against this by showing suspicious mixed-script domains in their encoded form — an address beginning <code>xn--</code>. If you ever see that prefix on a site claiming to be a well-known brand, stop.</p>

<p>Digit-and-letter substitutions belong to the same family and need no special characters at all: <code>rn</code> in place of <code>m</code>, <code>1</code> for <code>l</code>, <code>0</code> for <code>o</code>. In a small sans-serif font at a glance, <code>paypa1.com</code> and <code>rnicrosoft.com</code> read as the real thing.</p>

<h3>Combosquatting</h3>

<p>Probably the most common technique today, and it involves no misspelling at all — the brand name is spelled correctly, with an extra word attached.</p>

<p><code>apple-support.com</code>, <code>netflix-billing.net</code>, <code>secure-hdfcbank.com</code>. Nothing looks wrong, because nothing <em>is</em> misspelled. The added word even makes it plausible: of course the billing department has its own address.</p>

<p>It does not. Large organisations serve these functions from subdomains of their main domain — <code>support.apple.com</code>, not <code>apple-support.com</code>. A hyphen where you expect a dot is the whole attack.</p>

<h3>Alternative extensions</h3>

<p>Taking a brand's exact name under a different extension. The name matches perfectly; only the ending differs, and there are now hundreds of endings.</p>

<p>Some are chosen because they sound reassuring in context — a <code>.security</code> or <code>.support</code> ending on a message about your account.</p>

<h3>Subdomain stuffing</h3>

<p>The trick described at the top. The brand name is placed in the subdomain, where anyone can put anything: <code>login.yourbank.com.session-verify.top</code>.</p>

<p>It is especially effective on phones, where the address bar truncates long addresses — often showing exactly the reassuring left-hand portion and hiding the domain that actually matters.</p>

<h3>Path and parameter dressing</h3>

<p>The brand name after the slash: <code>secure-login.xyz/hdfcbank/netbanking/login</code>. The path is chosen entirely by the site owner and carries no authority at all. A long path pushes the real domain leftward and out of view on narrow screens.</p>

<h2>Why phones are harder</h2>

<p>Mobile browsers show a short address bar, often hide the address entirely while scrolling, and links arriving through messaging apps frequently open in in-app browsers with minimal address display. Link shorteners remove the address from view completely until after the page loads.</p>

<p>If a message on a phone asks you to log in or pay, the reliable move is not to squint at the address bar. It is to close the message, open the app or type the address yourself.</p>

<h2>How to defend against all of these at once</h2>

<p>The techniques are varied; the defence is not. Three habits cover essentially all of them.</p>

<p><strong>Do not arrive via links for anything that matters.</strong> For banking, payment and account security, navigate yourself — a bookmark, the app, or typing the address. This defeats every technique above simultaneously, because none of them can affect an address you typed.</p>

<p><strong>Use a password manager, and let it decide.</strong> This is the most underrated defence available. A password manager fills credentials only on the exact domain it saved them for. On a lookalike, it silently does nothing — and that silence is a far more reliable detector than your eyes. If your manager will not autofill on a site you expected it to, treat that as the alarm.</p>

<p><strong>When you must read an address, read it from the right.</strong> Find the extension, take one label to its left, ignore everything before it.</p>

<h2>Checking a suspicious address safely</h2>

<p>If you have a link and want to know what it is without visiting it: expand any shortener with a preview service rather than clicking, and inspect the registered domain's age and certificate details. A lookalike registered nine days ago, with a certificate issued the same week covering several other variants of the same brand name, is not ambiguous.</p>

<p>Our <a href="/">website checker</a> reports registration date, certificate details including the other hostnames a certificate covers, and reputation database listings, without you having to open the site. For the wider checklist see <a href="/guides/how-to-tell-if-a-website-is-a-scam/">how to tell if a website is a scam</a>, and <a href="/guides/https-and-ssl-what-the-padlock-proves/">what the padlock actually proves</a> for why a valid certificate on a lookalike is entirely normal.</p>
`,
}
