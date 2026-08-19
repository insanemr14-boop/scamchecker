export default {
  slug: 'how-to-recognise-phishing-messages',
  title: 'How to Recognise a Phishing Message: Email, SMS and WhatsApp',
  description:
    'Modern phishing has no spelling mistakes and no obvious tells. What still gives it away is structure — the pretext, the urgency, and the one thing every phishing message must ask you to do.',
  updated: '2026-08-19',
  body: `
<p class="lead">The traditional advice for spotting phishing was to look for bad grammar, generic greetings and obvious errors. That advice is now actively harmful, because it teaches people that a well-written message is safe. Generative tools have made fluent, correctly formatted, personalised phishing cheap to produce at scale.</p>

<p>What has not changed is the structure. A phishing message has a job to do, and that job constrains its shape in ways the writing quality cannot hide.</p>

<h2>The structure every phishing message shares</h2>

<p>Regardless of channel or story, essentially all of them contain three elements.</p>

<p><strong>A pretext</strong> — a reason this message exists. Your account has a problem, a payment failed, a parcel is held, a document awaits your signature, there is unusual activity on your account.</p>

<p><strong>A reason to act now</strong> — a deadline, a threat of loss, a closing window. This is not decoration. Its function is to stop you doing the thirty seconds of checking that would defeat the whole attempt.</p>

<p><strong>A single action, performed away from the message</strong> — click this link, call this number, scan this code, open this attachment, reply with a code. This is the only irreducible part. A phishing message that cannot get you to leave and act elsewhere has achieved nothing.</p>

<p>That third element is the useful one, because it suggests a defence that does not depend on judging the message at all: <em>perform the action independently instead</em>. Do the thing the message wants — check the account, look at the parcel, verify the payment — but by your own route.</p>

<h2>Signals that still discriminate</h2>

<h3>The channel does not match the claim</h3>

<p>Banks do not ask for credentials by SMS. Tax authorities do not open contact through messaging apps. Delivery companies do not request customs fees through a link in a text from an unknown number. When the claimed sender and the channel do not fit, that mismatch is meaningful — and it does not require you to inspect anything technical.</p>

<h3>The request is for something no legitimate sender asks for</h3>

<p>Some requests are disqualifying on their own, whoever appears to be asking:</p>

<ul>
  <li>Your full password. No legitimate organisation ever asks for it, by any channel.</li>
  <li>A one-time code that was just sent to you. These exist specifically to <em>not</em> be shared. Anyone asking you to read one out is trying to get into your account right now.</li>
  <li>Remote access to your device to "fix" something or "process a refund".</li>
  <li>Payment in gift cards, cryptocurrency or by transfer to a "safe account". There is no such thing as a safe account; that phrase is used almost exclusively by fraudsters.</li>
</ul>

<h3>The reply address does not match the display name</h3>

<p>Display names are free text and can say anything. Expand the actual sending address. Look at the registered domain, reading from the right — <code>service@paypal.security-alerts.info</code> is not PayPal, it is <code>security-alerts.info</code>.</p>

<h3>The link goes somewhere other than it says</h3>

<p>Hover a link on a desktop, or long-press on a phone, to see the destination before opening it. The visible text of a link is chosen by whoever wrote the message and need bear no relation to where it goes.</p>

<p>Read the destination from the right to find the registered domain. Our guide to <a href="/guides/lookalike-domains-and-typosquatting/">lookalike domains</a> covers the specific tricks used to make that address read as a brand you know.</p>

<h3>It knows something about you</h3>

<p>Counter-intuitive, and important. People treat personal detail as proof of legitimacy — the message names your bank, references a real recent order, uses your full name.</p>

<p>Data breaches are ubiquitous and breach data is traded. Knowing your name, address, phone number, which bank you use, or what you ordered last week is cheap. Targeted phishing built from breach data is the fastest-growing category precisely because personal detail is so persuasive.</p>

<p>Detail should not raise your trust. What matters is still the request and the channel.</p>

<h2>Channel-specific notes</h2>

<h3>SMS</h3>

<p>Sender IDs are trivially spoofed, including alphabetic ones. Worse, a spoofed message often lands <em>inside the existing thread</em> from the real organisation, appearing directly beneath genuine messages. Thread position is not evidence of anything.</p>

<p>Shortened links are the norm in SMS, which conveniently hides the destination.</p>

<h3>WhatsApp and messaging apps</h3>

<p>Two patterns dominate. The <strong>impersonation of a family member</strong> — a message from an unknown number claiming to be a relative who has lost their phone, leading to an urgent request for money. Verify by calling the person on their known number, which the message will discourage.</p>

<p>The other is the <strong>job or investment approach</strong>: an unsolicited offer of easy remote work or returns, opening warmly and moving to a platform showing fictional profits that cannot be withdrawn without a fee.</p>

<h3>QR codes</h3>

<p>A QR code is a link you cannot read before following. Codes stuck over legitimate ones on parking meters, restaurant tables and payment terminals are an established technique. Most phone cameras preview the address before opening — read it. Be especially wary of a QR code that leads to a page requesting payment or login.</p>

<h3>Phone calls</h3>

<p>Caller ID is spoofable, including numbers that match the one printed on your card. A common technique is a call claiming your account is compromised and your money must be moved to a "safe account".</p>

<p>The reliable defence: hang up and call back on a number you obtained yourself, from your card or the official app. Wait a minute or use a different phone, since a caller can hold the line open on some networks.</p>

<h2>The one rule that covers all of it</h2>

<p>Never act inside the message. Act independently.</p>

<p>If a message says your bank account has a problem, close it and open your banking app. If it says a parcel is held, go to the courier's site yourself and enter the tracking number. If it says a payment failed, log in the way you normally do.</p>

<p>Either the problem is real and you will find it there, or it is not and you have lost nothing. This works without you having to judge whether the message was convincing — which matters, because convincing is exactly what these messages are now engineered to be.</p>

<h2>If you already clicked</h2>

<p>Do not panic, and do not delay. If you entered a password, change it immediately — and change it everywhere else you used the same one, starting with your email. If you entered card details, call your issuer and have the card reissued. If you gave a one-time code, contact the organisation directly at once, as someone is likely inside the account already. If you installed something or granted remote access, disconnect the device from the network and change your passwords from a different device.</p>

<p>The full sequence, including reporting and the follow-up "recovery" scams that target people who have already lost money, is in <a href="/guides/what-to-do-if-you-have-been-scammed-online/">what to do if you have been scammed online</a>.</p>

<p>If you are unsure about a specific address, our <a href="/">website checker</a> reports its registration date, certificate and reputation listings without you having to visit it.</p>
`,
}
