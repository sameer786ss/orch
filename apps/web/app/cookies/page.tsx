import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd, LegalHubList } from '../../components/ui'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Cookie Policy, Google AdSense Disclosure & Editorial Disclaimer',
  description:
    'Comprehensive Cookie Policy, Google AdSense & DoubleClick DART cookie compliance disclosure, EU user consent standards, and editorial disclaimer for Orch.',
  path: '/cookies',
  keywords: [
    'Orch Cookie Policy',
    'Orch Google AdSense disclosure',
    'DoubleClick DART cookie opt-out',
    'EU User Consent Policy',
  ],
})

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'Cookies & Google AdSense Policy', path: '/cookies' },
])

export default function CookiesAndAdSensePage() {
  return (
    <main id="top">
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="hero">
        <article>
          <h1>Cookie Policy, Google AdSense Disclosure &amp; Disclaimer</h1>
          <p>
            Effective Date: 7 November 2026. This policy explains how <b>Orch</b> uses cookies and similar technologies on our public website, how we comply with <b>Google AdSense Programme Policies</b> and the <b>Google EU User Consent Policy</b>, how you can control or opt out of advertising cookies, and our editorial disclaimers.
          </p>
          <dl>
            <div><dt>AdSense</dt><dd>certified publisher compliance</dd></div>
            <div><dt>0 Ad Scripts</dt><dd>inside Orch software</dd></div>
            <div><dt>Opt-Out</dt><dd>direct user consent controls</dd></div>
          </dl>
          <small>Publisher: Orch, Compliance Contact: <a href="mailto:sameer@orch.live">sameer@orch.live</a></small>
        </article>
        <aside>
          <h2>Legal &amp; Compliance Hub</h2>
          <LegalHubList current="cookies" />
        </aside>
      </div>

      <div data-split="journal">
        <article>
          <h2>1. What Are Cookies and Why This Policy Matters</h2>
          <p>
            Cookies are small text files placed on your browser by websites you visit. They are widely used to make websites function efficiently, remember user preferences, ensure security, and deliver or measure relevant advertisements. At Orch, we believe in complete transparency about where cookies are used and where they are strictly prohibited.
          </p>

          <h2>2. Strict Separation Between Public Web Pages and Orch Software</h2>
          <p>
            Orch maintains an absolute boundary between our public informational website and our downloadable software applications:
          </p>
          <ul>
            <li><b>Inside Orch Desktop &amp; Mobile Applications:</b> Zero third-party advertising cookies, zero ad-network scripts, and zero behavioral tracking pixels are ever loaded inside the Orch software workspace or on our OAuth authentication handoff pages (<code>/auth-callback</code>, <code>/composio</code>, and <code>/oauth/composio</code>).</li>
            <li><b>On Public Website &amp; Research Blog Pages:</b> To keep our lengthy engineering reports open-access without paywalls and help sustain the complimentary $20/month compute credit provided to developers, public editorial pages may display advertisements served via Google AdSense.</li>
          </ul>

          <h2>3. Google AdSense &amp; DoubleClick DART Cookie Disclosure</h2>
          <p>
            In full compliance with Google AdSense Programme Policies, we provide the following mandatory disclosures to all visitors of our website:
          </p>
          <ul>
            <li><b>Third-Party Vendors Including Google:</b> Third-party vendors, including Google, use cookies to serve ads based on a user’s prior visits to this website or other websites across the Internet.</li>
            <li><b>DoubleClick DART &amp; Advertising Cookies:</b> Google’s use of advertising cookies enables Google and its certified partners to serve ads to our users based on their visit to our pages and/or other sites on the Internet.</li>
            <li><b>Direct Opt-Out via Google:</b> Users may opt out of personalized advertising at any time by visiting <a href="https://myadcenter.google.com/" rel="noopener noreferrer">Google Ads Settings</a> or reviewing <a href="https://policies.google.com/technologies/ads" rel="noopener noreferrer">How Google Uses Information from Sites or Apps That Use Our Services</a>.</li>
            <li><b>Industry-Wide Opt-Out Portals:</b> You can also opt out of third-party vendor cookies for personalized advertising by visiting the Digital Advertising Alliance consumer choice page at <a href="http://www.aboutads.info/choices/" rel="noopener noreferrer">www.aboutads.info/choices</a>, the Network Advertising Initiative at <a href="https://optout.networkadvertising.org/" rel="noopener noreferrer">optout.networkadvertising.org</a>, or (for European users) <a href="https://www.youronlinechoices.eu/" rel="noopener noreferrer">www.youronlinechoices.eu</a>.</li>
          </ul>

          <h2>4. Categories of Cookies Used on Our Website</h2>
          <p>
            When you browse public pages on our website, cookies fall into the following categories:
          </p>
          <ul>
            <li><b>Strictly Necessary &amp; Security Cookies:</b> Essential for basic website delivery, protecting forms against automated spam, and maintaining secure routing. These do not track browsing across external sites.</li>
            <li><b>Preference &amp; Consent Cookies:</b> Remember your privacy and cookie consent choices so you are not repeatedly prompted on every page load.</li>
            <li><b>Advertising &amp; Frequency-Capping Cookies (Google AdSense):</b> Used by Google and certified ad partners on public editorial pages to deliver ads, limit the number of times you see the same ad, measure ad effectiveness, and detect invalid click activity.</li>
          </ul>

          <h2>5. Compliance with the Google EU User Consent Policy (GDPR &amp; UK GDPR)</h2>
          <p>
            For visitors located in the European Economic Area (EEA), the United Kingdom, or Switzerland, Orch complies with the <b>Google EU User Consent Policy</b> and the IAB Transparency and Consent Framework (TCF) standards. Where required by law, non-essential cookies and personalized advertising tags are only activated after you provide affirmative consent. If you decline personalized cookies, only non-personalized contextual content is served.
          </p>

          <h2>6. How to Control or Disable Cookies in Your Browser</h2>
          <p>
            In addition to the opt-out links above, every modern web browser (including Google Chrome, Apple Safari, Mozilla Firefox, Microsoft Edge, and Brave) allows you to block third-party cookies, clear existing cookies, or browse in private/incognito mode. Blocking advertising cookies will never restrict your ability to read any Orch research article or download Orch binaries.
          </p>

          <h2>7. Editorial Integrity &amp; Technical Disclaimer</h2>
          <p>
            All research reports, field notes, postmortems, and token-pricing studies published on Orch are provided for educational, scientific, and engineering informational purposes:
          </p>
          <ul>
            <li><b>Independent Benchmarks:</b> Our empirical measurements reflect controlled tests conducted on specific repository workloads and model versions as dated in each report. Actual latency, recall, and token consumption in your environment may vary based on repository structure and provider load.</li>
            <li><b>No Financial or Legal Advice:</b> Analyses of AI compute economics, API token pricing, and cloud infrastructure costs are technical engineering assessments and do not constitute financial, investment, or legal advice.</li>
            <li><b>Third-Party Trademarks:</b> References to third-party platforms—including GitHub, Google Drive, Gmail, Jira, Slack, macOS, and Windows—are purely descriptive of user-authorized connectors in Orch. All product names, logos, and brands are property of their respective owners, and their inclusion does not imply endorsement by those trademark holders.</li>
          </ul>

          <h2>8. Contact Us</h2>
          <p>
            If you have any questions about our Cookie Policy, our Google AdSense disclosures, or our editorial standards, please contact us directly at <a href="mailto:sameer@orch.live">sameer@orch.live</a>.
          </p>
        </article>

        <aside>
          <h2>Quick Opt-Out Links</h2>
          <p>Control how Google and third-party vendors use advertising cookies across the web:</p>
          <menu>
            <a href="https://myadcenter.google.com/" data-btn="hot" rel="noopener noreferrer">Google Ad Center</a>
            <a href="http://www.aboutads.info/choices/" data-btn rel="noopener noreferrer">DAA Opt-Out</a>
            <a href="https://www.youronlinechoices.eu/" data-btn rel="noopener noreferrer">EDAA (Europe)</a>
          </menu>
          <h2>Related Policies</h2>
          <menu>
            <Link href="/privacy" data-btn>Privacy Policy</Link>
            <Link href="/terms" data-btn>Terms of Service</Link>
            <Link href="/security" data-btn>Security &amp; OAuth</Link>
          </menu>
        </aside>
      </div>
    </main>
  )
}
