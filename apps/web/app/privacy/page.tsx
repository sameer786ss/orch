import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd, LegalHubList } from '../../components/ui'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy — Google OAuth Limited Use & Data Protection',
  description:
    'Comprehensive Privacy Policy for Orch, Orch Desktop, and Orch Mobile, covering Google API Services User Data Policy (Limited Use), zero ad tracking, GDPR, and CCPA rights.',
  path: '/privacy',
  keywords: [
    'Orch Privacy Policy',
    'Orch data privacy',
    'Google API Limited Use policy',
    'zero model training code privacy',
  ],
})

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'Privacy Policy', path: '/privacy' },
])

export default function PrivacyPolicyPage() {
  return (
    <main>
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="hero">
        <article>
          <h1>Privacy Policy</h1>
          <p>
            Effective Date: 7 November 2026. This Privacy Policy describes how <b>Orch</b> (&ldquo;Orch&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, protects, retains, and discloses information when you visit our website, read our research publications, download or use the <b>Orch Desktop Application</b>, register for the upcoming <b>Orch Mobile Application</b>, or authorize third-party workspace integrations.
          </p>
          <dl data-metrics="">
            <div><dt>Limited Use</dt><dd>Google API Policy compliant</dd></div>
            <div><dt>0 Training</dt><dd>never train AI on private data</dd></div>
            <div><dt>GDPR &amp; CCPA</dt><dd>full global privacy rights</dd></div>
          </dl>
          <small>Data Controller: Orch, Privacy &amp; Data Protection Contact: <a href="mailto:sameer@orch.live">sameer@orch.live</a></small>
        </article>
        <aside>
          <h2>Legal &amp; Compliance Hub</h2>
          <LegalHubList current="privacy" />
          <p>For immediate data erasure, OAuth revocation assistance, or privacy inquiries, email <a href="mailto:sameer@orch.live">sameer@orch.live</a>.</p>
        </aside>
      </div>

      <div data-split="journal">
        <article>
          <h2>1. Scope and Applicability</h2>
          <p>
            Orch is committed to protecting the privacy, confidentiality, and intellectual property of software developers and website visitors. This Privacy Policy applies to all websites, software applications, email correspondence, authentication callbacks, and services operated by Orch. By accessing our website or using Orch, you acknowledge that you have read and understood the practices described in this policy.
          </p>

          <h2>2. Information We Collect</h2>
          <p>
            We adhere to a strict data-minimization principle and only collect information necessary to deliver our software, administer your monthly compute allocation, and publish our research:
          </p>
          <ul>
            <li><b>Account &amp; Profile Information:</b> When you sign in to Orch to activate your account and receive your complimentary $20/month compute allocation, we collect your basic account identifier (such as your name, email address, and authentication provider identifier).</li>
            <li><b>Authorized Workspace Connector Data:</b> When you explicitly choose to link third-party services—such as GitHub, Google Drive, Gmail, Jira, or Slack—to Orch, the application accesses only the specific repositories, documents, issues, messages, or threads that you request during an active session.</li>
            <li><b>Compute &amp; Usage Metering Records:</b> To administer the complimentary $20/month compute credit and apply your selected thinking mode (Low, Medium, or High), we record aggregate token counts, request timestamps, and credit balance deductions.</li>
            <li><b>Direct Email Communications:</b> When you email <code>sameer@orch.live</code> for support, dispatch requests, or peer review, we process your email address and message contents solely to respond to you.</li>
            <li><b>Standard Web Delivery Logs:</b> On public web pages, standard hosting access logs (such as IP address, browser user-agent, requested path, and timestamp) may be processed strictly for security, abuse prevention, and operational reliability.</li>
          </ul>

          <h2>3. Google API Services User Data Policy &amp; Limited Use Compliance</h2>
          <p>
            Orch’s use and transfer to any other app of information received from Google APIs will adhere to the <b>Google API Services User Data Policy</b>, including the <b>Limited Use</b> requirements. When you connect your Google Account, Google Drive, or Gmail to Orch, we enforce the following binding safeguards:
          </p>
          <ul>
            <li><b>Strict Limitation to User-Facing Features:</b> Information accessed via Google OAuth scopes (including Google Sign-In, Google Drive documents, and Gmail threads) is used exclusively to provide or improve user-facing features that are prominent and explicitly initiated by you within the Orch interface.</li>
            <li><b>Absolute Prohibition on AI/ML Model Training:</b> Orch never uses, transfers, aggregates, or retains user data obtained from Google APIs to train, fine-tune, or improve generalized artificial intelligence or machine learning models.</li>
            <li><b>Prohibition on Advertising &amp; Data Broker Transfers:</b> Google Workspace data obtained through OAuth scopes is never used for serving advertisements, personalized retargeting, creditworthiness assessment, or market research, and is never sold, rented, or disclosed to data brokers or advertising networks.</li>
            <li><b>Strict Prohibition on Human Viewing:</b> No Orch personnel may read or inspect your Google Drive files, Gmail messages, or private source code unless (a) we have obtained your affirmative, documented consent to investigate a specific support or security issue you reported, (b) it is necessary for security abuse prevention and integrity enforcement, or (c) it is required to comply with applicable law.</li>
            <li><b>Credential Isolation &amp; Instant Revocation:</b> Account sign-in refresh tokens are sealed in your device’s native OS keychain, while optional workspace connector authorizations are managed via scoped Composio OAuth links tied to your account. You may disconnect any integration inside Orch or revoke access via your Google Account Security settings (<code>myaccount.google.com/connections</code>) at any time.</li>
          </ul>

          <h2>4. How We Process Source Code and Workspace Context</h2>
          <p>
            When you run an engineering task in Orch using Low, Medium, or High thinking modes, selected code snippets and connector context required to answer your prompt are transmitted over encrypted connections to fulfill your request. Orch maintains strict zero-retention and non-training commitments: your proprietary source code, pull requests, Jira tickets, Slack discussions, Google Drive specifications, and Gmail threads are never used to train foundation models and are never shared with other users.
          </p>

          <h2>5. Advertising, Third-Party Trackers &amp; Cookies</h2>
          <p>
            Orch currently operates without third-party advertising networks, behavioral tracking pixels, or cross-site marketing cookies across both our public website and our desktop and mobile applications. Our strict Content Security Policy restricts script execution and network connections to first-party origins. If we ever introduce optional advertising on public editorial pages in the future, we will update this policy, our <Link href="/cookies">Cookie Policy</Link>, and provide affirmative consent controls in compliance with applicable privacy regulations before activating any non-essential cookies.
          </p>

          <h2>6. Lawful Bases for Processing (EEA, UK &amp; Switzerland)</h2>
          <p>
            If you are located in the European Economic Area (EEA), the United Kingdom, or Switzerland, we process your personal data under the following legal bases pursuant to Article 6 of the General Data Protection Regulation (GDPR):
          </p>
          <ul>
            <li><b>Performance of a Contract (Art. 6(1)(b)):</b> To provide the Orch software, authenticate your account, credit your $20/month compute balance, and execute user-requested workspace tasks.</li>
            <li><b>Explicit Consent (Art. 6(1)(a)):</b> When you voluntarily connect optional third-party OAuth integrations (GitHub, Google Drive, Gmail, Jira, Slack) or email us to receive updates. You may withdraw consent at any time.</li>
            <li><b>Legitimate Interests (Art. 6(1)(f)):</b> To maintain service security, prevent automated abuse or fraud against our free compute grant, and ensure operational reliability.</li>
            <li><b>Legal Obligations (Art. 6(1)(c)):</b> To comply with applicable statutory, tax, regulatory, or lawful enforcement obligations.</li>
          </ul>

          <h2>7. Data Retention and Deletion Schedules</h2>
          <p>
            We retain personal information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy:
          </p>
          <ul>
            <li><b>Active Account Records:</b> Account identifiers and monthly compute credit ledgers are retained while your Orch account remains active.</li>
            <li><b>Connector Authorizations:</b> Disconnecting any workspace integration in Orch immediately deletes the connected account authorization on our connector service and stops further access.</li>
            <li><b>Cloud Sessions:</b> Temporary working states created during Cloud Sessions are wiped upon session completion or termination.</li>
            <li><b>Account Erasure Requests:</b> When you request deletion of your account by emailing <a href="mailto:sameer@orch.live">sameer@orch.live</a>, we permanently delete your account profile and associated records within 72 hours, except where narrow retention is strictly required by law.</li>
          </ul>

          <h2>8. Data Sharing and Subprocessors</h2>
          <p>
            Orch does not sell, rent, or trade your personal information. We only share limited data with vetted infrastructure and service providers where strictly required to operate our services (such as cloud hosting, authentication, Composio connector brokerage, and model inference providers bound by confidentiality and zero-training obligations), or when required by valid legal process.
          </p>

          <h2>9. Your Rights Under GDPR, CCPA/CPRA, and Global Privacy Laws</h2>
          <p>
            Depending on your jurisdiction—including residents of the EEA, UK, Switzerland, California (under CCPA/CPRA), Virginia, Colorado, and other states or countries—you have comprehensive rights regarding your personal information:
          </p>
          <ul>
            <li><b>Right to Know &amp; Access:</b> Request confirmation of whether we process your personal data and obtain a portable copy of the information we hold about you.</li>
            <li><b>Right to Correction (Rectification):</b> Request correction of inaccurate or incomplete personal information.</li>
            <li><b>Right to Deletion (Erasure):</b> Request permanent deletion of your account and personal data (&ldquo;right to be forgotten&rdquo;).</li>
            <li><b>Right to Revoke OAuth Consent:</b> Disconnect any third-party integration (Google Drive, Gmail, GitHub, Jira, Slack) at any time without penalty.</li>
            <li><b>No Sale of Personal Information:</b> Orch never sells or shares personal information for cross-context behavioral advertising as defined under the CCPA/CPRA.</li>
            <li><b>Right to Non-Discrimination:</b> Exercising your privacy rights will never result in discriminatory treatment or loss of access to your complimentary $20/month compute allocation.</li>
          </ul>
          <p>
            To exercise any of these rights, send an email to <a href="mailto:sameer@orch.live">sameer@orch.live</a>. We verify and respond to all privacy requests within 15 business days (and within 72 hours for account deletion requests).
          </p>

          <h2>10. Children’s Privacy</h2>
          <p>
            Orch’s website and software applications are designed for software developers and technical professionals and are not directed to children under the age of 16. We do not knowingly collect personal information from children under 16. If we become aware that a child has provided personal data, we will delete it immediately.
          </p>

          <h2>11. Changes to This Privacy Policy &amp; Contact Information</h2>
          <p>
            We may update this Privacy Policy periodically to reflect new features, regulatory requirements, or security enhancements. When we make material changes, we will update the Effective Date at the top of this page. For any questions, concerns, or formal data protection inquiries, contact our Privacy Office directly at <a href="mailto:sameer@orch.live">sameer@orch.live</a>.
          </p>
        </article>

        <aside>
          <h2>Summary of Commitments</h2>
          <p><b>Organization:</b> Orch</p>
          <p><b>Privacy Contact:</b> <a href="mailto:sameer@orch.live">sameer@orch.live</a></p>
          <p><b>Google OAuth:</b> 100% compliant with Google API Services User Data Policy &amp; Limited Use requirements.</p>
          <p><b>Model Training:</b> Zero training on user source code, Google Drive files, or Gmail messages.</p>
          <p><b>Trackers:</b> Zero third-party advertising scripts or behavioral tracking cookies across web and software.</p>
          <menu>
            <Link href="/security" data-btn="hot">Security &amp; OAuth</Link>
            <Link href="/cookies" data-btn="">Cookies &amp; Disclaimer</Link>
            <Link href="/terms" data-btn="">Terms of Service</Link>
          </menu>
        </aside>
      </div>
    </main>
  )
}
