import type { Metadata } from 'next'
import Link from 'next/link'
import { ConnectorGrid, JsonLd, LegalHubList } from '../../components/ui'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Security, Trust & OAuth Data Governance',
  description:
    'Comprehensive security architecture, system-browser OAuth handoff, OS keychain credential storage, Google API Limited Use governance, and workspace connector protection standards for Orch.',
  path: '/security',
  keywords: [
    'Orch Security',
    'Orch OAuth',
    'Google API Limited Use compliance',
    'zero-trust workspace connectors',
  ],
})

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'Security & OAuth Governance', path: '/security' },
])

export default function SecurityPage() {
  return (
    <main>
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="hero">
        <article>
          <h1>Security &amp; OAuth Compliance</h1>
          <p>
            Orch is built for professional software engineers who require strict protection over their proprietary source code, credentials, and connected workspace accounts (GitHub, Google Drive, Gmail, Jira, and Slack). Here is how Orch safeguards your data and complies with global security and OAuth standards.
          </p>
          <dl data-metrics="">
            <div><dt>OAuth 2.0</dt><dd>system-browser code flow handoff</dd></div>
            <div><dt>0 Training</dt><dd>strict non-training guarantee</dd></div>
            <div><dt>TLS 1.3</dt><dd>end-to-end encrypted transit</dd></div>
          </dl>
          <small>Security Team &amp; Vulnerability Disclosure: <a href="mailto:sameer@orch.live">sameer@orch.live</a></small>
        </article>
        <aside>
          <h2>Legal &amp; Compliance Hub</h2>
          <LegalHubList current="security" />
          <p>All authentication callback routes enforce non-indexing rules and scrub query parameters immediately upon handoff.</p>
        </aside>
      </div>

      <div data-split="journal">
        <article>
          <h2>1. Defense-in-Depth Security Philosophy</h2>
          <p>
            An agentic coding workspace operates at the intersection of your source code and your engineering collaboration tools. At Orch, our security model is founded on three non-negotiable pillars: least-privilege authorization, strict credential isolation, and explicit human-in-the-loop verification for external actions.
          </p>

          <h2>2. OAuth 2.0 Authorization &amp; Credential Protection</h2>
          <p>
            When you sign in to Orch or connect an external workspace integration (GitHub, Google Drive, Gmail, Jira, or Slack), Orch never asks for raw passwords and never uses insecure embedded webviews:
          </p>
          <ul>
            <li><b>System-Browser OAuth Code Flow:</b> Sign-in and connector consent flows always open in your default system browser with full passkey and hardware 2FA support.</li>
            <li><b>Stateless Web Handoff Relay:</b> Once consent completes, our callback routes (<code>/auth-callback</code> and <code>/oauth/composio</code>) immediately scrub query parameters from your browser history and hand control back to Orch Desktop over the registered <code>orch://</code> application protocol.</li>
            <li><b>OS Keychain &amp; Scoped Connector Brokerage:</b> Your account sign-in refresh token is sealed directly inside your operating system’s native encrypted credential vault (macOS Keychain or Windows Credential Locker). Optional third-party connectors are authorized through Composio under your verified user ID and can be disconnected in one click from Orch Desktop.</li>
          </ul>

          <h2>3. Connector Scope Transparency (GitHub, Drive, Gmail, Jira, Slack)</h2>
          <p>
            Orch only requests permissions when you explicitly choose to enable a specific connector, and limits each integration to clear engineering workflows:
          </p>
          <ConnectorGrid />

          <h2>4. Google OAuth Verification &amp; Limited Use Governance</h2>
          <p>
            Orch’s integration with Google Workspace APIs (including Google Sign-In, Google Drive, and Gmail) is engineered in strict compliance with the <b>Google API Services User Data Policy</b> and its <b>Limited Use</b> requirements:
          </p>
          <ul>
            <li><b>User-Initiated Access Only:</b> Orch only reads Google Drive documents or Gmail threads when you explicitly reference or attach them to an active engineering task.</li>
            <li><b>Zero Model Training:</b> Google user data is never used to train, fine-tune, or improve generalized artificial intelligence or machine learning models.</li>
            <li><b>Zero Ad-Tech Transfer:</b> Google user data is never shared with advertising networks, analytics brokers, or third-party marketers.</li>
            <li><b>Immediate Revocation:</b> Disconnecting Google Drive or Gmail in Orch—or via your Google Account Connections page—immediately terminates access and revokes the connected account.</li>
          </ul>

          <h2>5. Human-in-the-Loop Approval Gates &amp; Prompt-Injection Protection</h2>
          <p>
            Whenever an autonomous session processes external text (such as a customer bug report in Gmail or a public GitHub issue), Orch enforces strict boundary controls. Outbound mutating actions—such as opening or merging a pull request, modifying a Jira ticket, sending an email, or posting a message to Slack—cannot execute silently in the background. Every external write action is staged in the Orch review bar, displaying the exact target and payload for your explicit human approval.
          </p>

          <h2>6. Cloud Session Isolation &amp; Data Protection</h2>
          <p>
            For users utilizing Cloud Sessions (coming soon to Orch Desktop and the upcoming Orch Mobile application), each session executes inside a dedicated, hardware-isolated cloud environment with encrypted ephemeral storage. All network communications are encrypted using TLS 1.3, and temporary session volumes are permanently destroyed upon session completion.
          </p>

          <h2>7. Responsible Vulnerability Disclosure Program</h2>
          <p>
            Orch values the work of independent security researchers. If you believe you have discovered a security vulnerability in Orch, our OAuth handoff routes, or our website, please report it directly to <a href="mailto:sameer@orch.live">sameer@orch.live</a> with a clear description and reproduction steps. We review and acknowledge all legitimate security reports within 24 hours and work promptly to remediate verified findings.
          </p>
        </article>

        <aside>
          <h2>Security Contacts</h2>
          <p><b>Security Desk:</b> <a href="mailto:sameer@orch.live">sameer@orch.live</a></p>
          <p><b>Response Target:</b> Under 24 hours for vulnerability and OAuth inquiries.</p>
          <h2>Related Documentation</h2>
          <menu>
            <Link href="/privacy" data-btn="hot">Privacy &amp; Limited Use</Link>
            <Link href="/terms" data-btn="">Terms of Service</Link>
            <Link href="/cookies" data-btn="">Cookies &amp; Disclaimer</Link>
            <Link href="/blog/zero-trust-oauth-agent-connectors" data-btn="">Connector Research Paper</Link>
          </menu>
        </aside>
      </div>
    </main>
  )
}
