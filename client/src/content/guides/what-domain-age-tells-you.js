export default {
  slug: 'what-domain-age-tells-you',
  title: 'What Domain Age Tells You About a Website (And What It Does Not)',
  description:
    'Domain age is the strongest single signal available for judging an unfamiliar website. Here is why it works, how to read it correctly, and the three ways it can mislead you.',
  updated: '2026-08-19',
  body: `
<p class="lead">Of all the checks you can run on an unfamiliar website, registration date carries the most signal for the least effort. It is public, it is cheap to look up, and unlike almost everything else on a web page, the site owner cannot edit it.</p>

<p>But it is routinely misread — in both directions. Here is what the number actually means.</p>

<h2>Why domain age works as a signal</h2>

<p>It works because of economics, not technology.</p>

<p>A fraudulent storefront has a short, predictable life. It launches, runs advertising hard for a few weeks, takes orders it will not fulfil, and collapses once chargebacks, complaints and reputation listings accumulate. Then the operators register a new domain and rebuild — often from the same template, sometimes with the same product photographs.</p>

<p>The whole model depends on the domain being disposable. Nobody invests three years of reputation into an asset they plan to abandon by Christmas. So the population of scam sites skews overwhelmingly young, and the population of very old domains is overwhelmingly legitimate.</p>

<p>This is a statistical statement, not a rule about any individual site — which is the source of most misreadings.</p>

<h2>How to read the number</h2>

<p>Registration date is best read as a prior that shifts how much corroboration you need, rather than as a verdict.</p>

<ul>
  <li><strong>Days to weeks old.</strong> High risk. Not automatically fraud — every legitimate business has a first week — but a site this new asking for payment should be corroborated independently before you pay.</li>
  <li><strong>One to six months.</strong> Elevated. Fine for a genuine new venture, and exactly the age at which scam sites are most actively advertising.</li>
  <li><strong>Six months to two years.</strong> Unremarkable. The domain has outlived the typical scam lifecycle. Judge on other signals.</li>
  <li><strong>Over two years.</strong> Genuinely reassuring. Something has been maintained at this address for longer than fraud usually survives.</li>
  <li><strong>Over ten years.</strong> Very strong, subject to the caveats below.</li>
</ul>

<h2>The three ways domain age misleads you</h2>

<p>Anyone relying on this check should know its failure modes, because they are exploited deliberately.</p>

<h3>1. Aged domains are bought and repurposed</h3>

<p>There is an active market in expired domains, and part of the demand comes from people who want the trust that age confers. A fraudster can buy a domain registered in 2008 by a defunct plumbing company and run a fake electronics store on it.</p>

<p>The tell is discontinuity. Look at the site's history in a web archive. If a domain registered in 2008 has fifteen years of plumbing pages and then, four weeks ago, became a consumer electronics retailer, the age belongs to the plumber, not to the people you are about to pay.</p>

<h3>2. Renewal date is not registration date</h3>

<p>This is a plain misreading, and common. Tools display several dates: creation, last updated, and expiry. The <em>creation</em> date is the one that matters. A domain created in 2011 and updated last month is eleven years old, not one month old — an update usually just means the nameservers or contact details changed.</p>

<h3>3. A young domain is not evidence of fraud</h3>

<p>The inverse error, and it is unfair to new businesses. Every legitimate company was three weeks old once. A young domain means "I have no history to judge you by, so show me something else" — not "you are a criminal".</p>

<p>What resolves the ambiguity is corroboration that is expensive to fake: a physical address that checks out, a company registration number you can verify with the relevant registry, reviews on platforms the seller does not control, and a card payment option with real chargeback rights.</p>

<h2>Reading it alongside the other signals</h2>

<p>Domain age is most useful in combination, where it either confirms or contradicts what the site claims about itself.</p>

<p>The highest-value contradiction is between registration date and stated history. A site whose About page says "family-run since 1998" sitting on a domain registered five weeks ago has made a claim that the public record refutes. That is not a soft signal or a matter of interpretation — the site is lying about a verifiable fact, and that alone is sufficient reason to leave.</p>

<p>Other combinations worth noting:</p>

<ul>
  <li><strong>Young domain + irreversible payment only.</strong> The two strongest fraud indicators together. Treat as fraud.</li>
  <li><strong>Young domain + heavy paid advertising.</strong> The economics of the scam lifecycle: buy traffic fast, before the domain gets listed.</li>
  <li><strong>Old domain + brand-new content + a completely different industry.</strong> Likely a repurposed aged domain.</li>
  <li><strong>Old domain + consistent archived history + verifiable company details.</strong> About as good as this kind of evidence gets.</li>
</ul>

<h2>Where the data comes from</h2>

<p>Registration dates come from WHOIS, the public record maintained by domain registries. Privacy services can mask the registrant's <em>name and contact details</em>, and most registrars now do this by default — that is normal and not itself suspicious. What privacy services do not mask is the creation date, which is why this check remains reliable even when the ownership fields are redacted.</p>

<p>Coverage varies by extension. Some country-code registries publish less than others, and a few publish almost nothing, so occasionally the date is genuinely unavailable rather than hidden.</p>

<h2>The practical version</h2>

<p>Look up the creation date. Compare it against what the site claims about its own history. If those two things disagree, stop there.</p>

<p>If they agree and the domain is young, do not treat that as guilt — treat it as an instruction to find corroboration elsewhere, and to pay by a method you can reverse.</p>

<p>Our <a href="/">website checker</a> reports the creation date alongside certificate details, DNS records and reputation listings, so you can see whether the signals agree with each other rather than checking them one at a time. For the wider checklist, see <a href="/guides/how-to-tell-if-a-website-is-a-scam/">how to tell if a website is a scam</a>.</p>
`,
}
