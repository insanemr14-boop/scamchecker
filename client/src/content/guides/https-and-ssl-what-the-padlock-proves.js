export default {
  slug: 'https-and-ssl-what-the-padlock-proves',
  title: 'HTTPS and the Padlock: What It Actually Proves About a Website',
  description:
    'The padlock means your connection is encrypted. It does not mean the site is honest. Here is what certificates really verify, the three validation levels, and how to read one properly.',
  updated: '2026-08-19',
  body: `
<p class="lead">"Check for the padlock" is the most repeated piece of online safety advice, and it is now close to useless as a fraud check. Not because it is wrong — the padlock does mean something — but because what it means has almost nothing to do with whether the site will steal your money.</p>

<p>The great majority of phishing sites use HTTPS. They have padlocks. The padlock is not lying to you; people are simply reading a claim it never made.</p>

<h2>What the padlock actually claims</h2>

<p>A padlock tells you two things, both narrow:</p>

<ol>
  <li><strong>The connection is encrypted.</strong> Data between your browser and the server cannot be read or altered in transit by someone on the same network.</li>
  <li><strong>The server proved control of this domain name.</strong> You are genuinely talking to whoever operates that exact address, not an impostor intercepting the connection.</li>
</ol>

<p>Read point two carefully, because it is where the misunderstanding lives. The certificate proves the server controls <em>the domain name you typed</em>. If you typed a scammer's domain, the certificate faithfully confirms you have reached the scammer, securely and without interference.</p>

<p>Encryption protects the channel. It says nothing about the character of the party at the other end.</p>

<h2>Why nearly every scam site has one now</h2>

<p>Certificates used to cost money and involve paperwork, which made them a weak proxy for "someone spent real effort here". Two changes ended that.</p>

<p>First, free automated certificate authorities made domain-validated certificates available at no cost, issued in seconds, with no human review. Validation is fully automatic: prove you control the domain, receive a certificate.</p>

<p>Second, browsers began marking plain HTTP sites as "Not secure". That made HTTPS mandatory for anyone wanting to appear credible — including fraudsters, who adopted it immediately.</p>

<p>The result is that HTTPS went from a mild positive signal to no signal at all. Its <em>absence</em> on a site asking for payment is still a serious warning. Its presence tells you nothing.</p>

<h2>The three validation levels</h2>

<p>Not all certificates verify the same thing, and this is where useful information still lives. Click the padlock, view the certificate, and look at who it was issued to.</p>

<h3>Domain Validated (DV)</h3>

<p>The issuer confirmed the applicant controls the domain. Nothing else. No check on the company, no human involvement, free, issued in seconds. The certificate names only the domain.</p>

<p>Most of the web uses DV, including plenty of entirely legitimate sites. It is also what essentially every phishing page uses.</p>

<h3>Organisation Validated (OV)</h3>

<p>The issuer additionally verified that a real, registered legal entity applied — checking business registration records and usually making contact. Costs money, takes days, requires documentation.</p>

<p>An OV certificate names the organisation, and that is the useful part: someone independently confirmed a real registered company stands behind this domain.</p>

<h3>Extended Validation (EV)</h3>

<p>The most rigorous tier — verification of legal, physical and operational existence against defined standards.</p>

<p>Browsers used to display EV certificates with a green bar showing the company name. They removed that treatment, having concluded users did not understand it and it could itself be gamed. So EV no longer looks different in the address bar, but the organisation details are still visible in the certificate itself.</p>

<h2>How to actually read a certificate</h2>

<p>Thirty seconds, in any desktop browser:</p>

<ol>
  <li>Click the padlock in the address bar.</li>
  <li>Choose the connection or certificate details option.</li>
  <li>Look at four fields.</li>
</ol>

<p><strong>Issued to.</strong> Just a domain name means DV. A company name and country means OV or EV — someone verified a legal entity.</p>

<p><strong>Issued by.</strong> The certificate authority. Recognisable public CAs are normal. A self-signed certificate, or one from an authority your browser does not trust, is a serious warning on a public site.</p>

<p><strong>Valid from.</strong> Useful and often overlooked. A certificate issued four days ago on a site claiming a decade of trading is a discrepancy worth taking seriously — it frequently accompanies a freshly registered domain.</p>

<p><strong>Subject Alternative Names.</strong> The list of hostnames the certificate covers. On a shared hosting certificate this can legitimately include many unrelated domains. But if it lists a set of near-identical lookalike domains — the same brand name with different spellings or extensions — you are almost certainly looking at a phishing operation that provisioned its whole set at once.</p>

<h2>The case that matters most: the lookalike domain</h2>

<p>Here is the scenario the padlock advice fails, and it is the most common one.</p>

<p>You receive a message about your account and follow the link. The page is a pixel-perfect copy of a service you use. It has a padlock and a valid certificate. Everything looks right.</p>

<p>The domain is <code>your-bank-secure.com</code> rather than <code>yourbank.com</code>. The certificate is completely valid — for <em>that</em> domain. The encryption works perfectly, protecting your credentials in transit all the way to the criminal.</p>

<p>The padlock cannot help here, because nothing about this is a certificate failure. The defence is to read the domain name itself, and better still not to arrive via a link at all. Type the address yourself, or use a bookmark you created earlier.</p>

<p>When you read a domain, read it from the right. In <code>yourbank.com.login-secure.xyz</code>, the actual registered domain is <code>login-secure.xyz</code> — everything before it is subdomain text the attacker chose freely.</p>

<h2>What to take from this</h2>

<p>No padlock on a page asking for payment or credentials — leave, without exception.</p>

<p>A padlock present — you have learned only that the connection is encrypted. Continue checking everything else: the exact spelling of the domain, the registration date, the payment methods, the contact details.</p>

<p>A certificate naming a verified organisation matching the company the site claims to be — a genuine positive signal, and worth the ten seconds to look.</p>

<p>Our <a href="/">website checker</a> reports certificate issuer, validation level and issue date alongside domain age and reputation listings. The full manual checklist is in <a href="/guides/how-to-tell-if-a-website-is-a-scam/">how to tell if a website is a scam</a>.</p>
`,
}
