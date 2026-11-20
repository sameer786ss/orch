import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd, LegalHubList } from '../../components/ui'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Cookie Policy & Editorial Disclaimer',
  description:
    'Cookie Policy, strict zero-tracker Content Security Policy disclosure, and editorial research disclaimer for Orch.',
  path: '/cookies',
  keywords: [
    'Orch Cookie Policy',
    'Orch editorial disclaimer',
    'Orch privacy standards',
  ],
})

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'Cookies & Editorial Policy', path: '/cookies' },
])

export default function CookiesPolicyPage() {
  return (
    <main>
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="hero">
        <article>
          <h1>Cookie Policy &amp; Editorial Disclaimer</h1>
          <p>
            Effective Date: 7 November 2026. This policy explains how <b>Orch</b> handles browser storage and cookies across our website and OAuth callback routes, why we enforce a strict zero-tracker Content Security Policy, and our editorial disclaimers for published research.
          </p>
          <dl data-metrics="">
            <div><dt>0 Trackers</dt><dd>no third-party analytics or ad scripts</dd></div>
            <div><dt>Strict CSP</dt><dd>first-party script &amp; network policy</dd></div>
            <div><dt>Stateless</dt><dd>OAuth callbacks scrub URL history</dd></div>
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
          <h2>1. What Are Cookies and How Orch Uses Them</h2>
          <p>
            Cookies are small text files stored by your browser. Many websites load third-party analytics, behavioral retargeting pixels, and advertising cookies by default. Orch takes the opposite approach: our public website does not set non-essential tracking cookies, does not load third-party ad scripts, and does not sell visitor browsing profiles.
          </p>

          <h2>2. Strict Boundary Across Public Pages, OAuth Routes &amp; Orch Software</h2>
          <p>
            Orch enforces strict isolation across all properties:
          </p>
          <ul>
            <li><b>Public Informational &amp; Blog Pages:</b> Delivered statically and server-rendered with a strict Content Security Policy (<code>script-src &apos;self&apos;</code>, <code>connect-src &apos;self&apos;</code>) that prevents third-party ad networks or tracking scripts from executing.</li>
            <li><b>OAuth Handoff Routes (<code>/auth-callback</code>, <code>/oauth/composio</code>):</b> Marked <code>noindex</code>, load zero external scripts, and immediately scrub query parameters from browser history via <code>window.history.replaceState</code> before handing off to Orch Desktop.</li>
            <li><b>Orch Desktop &amp; Mobile Applications:</b> Contain zero advertising SDKs, zero third-party ad cookies, and zero behavioral tracking pixels.</li>
          </ul>

          <h2>3. Strictly Necessary Infrastructure Storage</h2>
          <p>
            While Orch sets no marketing or behavioral tracking cookies, your browser or our hosting edge provider may use strictly necessary technical mechanisms (such as TLS session state or edge routing protection) solely to deliver pages securely and defend against automated abuse.
          </p>

          <h2>4. Browser Privacy Controls</h2>
          <p>
            Every modern web browser (including Google Chrome, Apple Safari, Mozilla Firefox, Microsoft Edge, and Brave) lets you inspect, block, or clear cookies and site data at any time. Blocking cookies in your browser will never restrict your ability to read any Orch research paper or download Orch installers.
          </p>

          <h2>5. Future Policy Changes</h2>
          <p>
            If Orch ever introduces optional cookies or third-party advertising on public editorial pages in the future, we will update this policy in advance, relax the applicable CSP directives transparently, and present affirmative consent controls (including GDPR/UK GDPR opt-in and standard opt-out portals such as <a href="https://myadcenter.google.com/" rel="noopener noreferrer">Google Ad Center</a> and <a href="https://optout.aboutads.info/" rel="noopener noreferrer">DAA Opt-Out</a>) before activating any non-essential cookies.
          </p>

          <h2>6. Editorial Integrity &amp; Technical Disclaimer</h2>
          <p>
            All research reports, field notes, postmortems, and token-pricing studies published on Orch are provided for educational, scientific, and engineering informational purposes:
          </p>
          <ul>
            <li><b>Independent Benchmarks:</b> Our empirical measurements reflect controlled tests conducted on specific repository workloads and model versions as dated in each report. Actual latency, recall, and token consumption in your environment may vary based on repository structure and provider load.</li>
            <li><b>No Financial or Legal Advice:</b> Analyses of AI compute economics, API token pricing, and cloud infrastructure costs are technical engineering assessments and do not constitute financial, investment, or legal advice.</li>
            <li><b>Third-Party Trademarks:</b> References to third-party platforms—including GitHub, Google Drive, Gmail, Jira, Slack, macOS, and Windows—are purely descriptive of user-authorized connectors in Orch. All product names, logos, and brands are property of their respective owners, and their inclusion does not imply endorsement by those trademark holders.</li>
          </ul>

          <h2>7. Contact Us</h2>
          <p>
            If you have any questions about our Cookie Policy, browser security headers, or editorial standards, please contact us directly at <a href="mailto:sameer@orch.live">sameer@orch.live</a>.
          </p>
        </article>

        <aside>
          <h2>Related Policies</h2>
          <p>Inspect how Orch protects your source code, credentials, and connected accounts:</p>
          <menu>
            <Link href="/privacy" data-btn="hot">Privacy Policy</Link>
            <Link href="/terms" data-btn="">Terms of Service</Link>
            <Link href="/security" data-btn="">Security &amp; OAuth</Link>
          </menu>
        </aside>
      </div>
    </main>
  )
}
