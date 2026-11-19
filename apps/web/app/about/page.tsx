import type { Metadata } from 'next'
import Link from 'next/link'
import { Subscribe } from '../../components/islands'
import { JsonLd, PaperList } from '../../components/ui'
import { DOWNLOAD_LINKS } from '../../lib/content'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'About Orch — Independent Agentic Engineering Lab',
  description:
    'Learn about Orch, our independent AI systems research mission, editorial charter, $20/month universal developer compute commitment, compliance governance, and our products.',
  path: '/about',
  keywords: [
    'About Orch',
    'Orch Labs',
    'Sameer Orch',
    'Orch mission',
    'agentic software engineering lab',
  ],
})

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'About Orch', path: '/about' },
])

export default function AboutPage() {
  return (
    <main id="top">
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="hero">
        <article>
          <h1>We research how autonomous engineering actually works, and we build Orch.</h1>
          <p>
            Orch is an independent software research and engineering organization founded by Sameer. We study the reliability of autonomous coding systems, audit the real-world economics of artificial intelligence compute, and build <b>Orch</b>—an agentic software engineering workspace for macOS, Windows, and soon iOS and Android.
          </p>
          <dl>
            <div><dt>$20 / mo</dt><dd>free compute for every user</dd></div>
            <div><dt>6 Studies</dt><dd>open-access empirical research</dd></div>
            <div><dt>Desktop</dt><dd>macOS &amp; Windows app</dd></div>
          </dl>
          <small>Direct Contact &amp; Inquiries: <a href="mailto:sameer@orch.live">sameer@orch.live</a></small>
          <menu>
            <Link href="/orch-code" data-btn="hot">Download Orch</Link>
            <a href="mailto:sameer@orch.live" data-btn>Contact Sameer</a>
          </menu>
        </article>
        <section>
          <header>
            <h2>Our Core Institutional Commitments</h2>
            <small>What defines Orch</small>
          </header>
          <ul>
            <li><b>Empirical Rigor Over Marketing Claims:</b> We do not publish synthetic cherry-picked demos. Every study we release measures failure rates, latency trade-offs, and actual invoice costs across real multi-file software repositories.</li>
            <li><b>Universal Developer Access ($20/Month Free):</b> High-reasoning software tools should not be locked behind immediate paywalls. Every registered Orch user receives $20 of complimentary compute credit every month at zero cost.</li>
            <li><b>Uncompromising Data Privacy:</b> Your proprietary source code, documents, and communications belong exclusively to you. Orch never trains generalized AI models on your private workspace data.</li>
            <li><b>Full Regulatory &amp; Platform Compliance:</b> Orch adheres strictly to the Google API Services User Data Policy (Limited Use), Google AdSense Programme Policies, GDPR, CCPA/CPRA, and international data protection standards.</li>
          </ul>
        </section>
      </div>

      <div data-split="journal">
        <article>
          <h2>1. Who We Are and Why We Founded Orch</h2>
          <p>
            Modern software engineering is undergoing a structural shift from manual line-by-line editing to autonomous, multi-step agentic workflows. Yet as engineering teams adopt artificial intelligence tools, they confront two persistent problems: brittle tool loops that fail on complex production codebases, and opaque pricing structures where falling headline token prices paradoxically result in higher monthly compute bills.
          </p>
          <p>
            Orch was established to address both challenges under one roof. Rather than separating academic evaluation from product engineering, our team operates as a unified lab. When we discover why an autonomous loop loses track of repository constraints after forty turns, or why uncalibrated reasoning depth wastes compute on routine edits, we publish the full empirical findings in our open-access journal and build the engineering fix directly into Orch.
          </p>

          <h2>2. Orch &amp; The $20/Month Universal Compute Grant</h2>
          <p>
            Orch (currently available for macOS Apple Silicon, macOS Intel, and Windows, with Orch Mobile in active development) is our flagship agentic workspace. It combines a structured multi-file engineering environment with calibrated Low, Medium, and High thinking modes and user-authorized connectors for GitHub, Google Drive, Gmail, Jira, and Slack.
          </p>
          <p>
            We believe every software engineer, student, and independent builder should be able to evaluate and use an agentic workspace on real work without financial friction. That is why Orch provides every user with $20.00 USD of complimentary monthly compute credit at zero cost. By pairing transparent token accounting with user-controlled thinking budgets, Orch enables developers to complete hundreds of real engineering tasks each month within their free allocation.
          </p>

          <h2>3. Editorial Independence &amp; Research Integrity</h2>
          <p>
            Our research reports, benchmarks, and postmortems are written by the engineers who design and test our systems. Orch maintains a strict firewall between our editorial research and any commercial or advertising relationships:
          </p>
          <ul>
            <li><b>No Paid Placements or Sponsored Rankings:</b> No model provider, cloud vendor, or third-party service can pay to influence our benchmark methodologies, latency measurements, or economic analyses.</li>
            <li><b>Reproducible Methodologies:</b> Whenever we evaluate reasoning modes, context retrieval precision, or token pricing structures, we document the task distributions, evaluation criteria, and failure modes in plain language.</li>
            <li><b>Corrections &amp; Peer Review:</b> When readers or external researchers identify an edge case or flaw in our published analyses, we audit the claim and issue transparent updates.</li>
          </ul>

          <h2>4. Governance, Privacy &amp; Industry Compliance</h2>
          <p>
            Building software that connects to a developer’s source control, issue trackers, documents, and email requires the highest level of institutional trust. Orch is structured from the ground up around strict compliance and data minimization:
          </p>
          <ul>
            <li><b>Google OAuth &amp; Limited Use Compliance:</b> Whenever a user links Google Workspace services (such as Google Drive or Gmail) to Orch, access is governed by explicit user consent and adheres strictly to the Google API Services User Data Policy, including all Limited Use requirements. Workspace data is never used for advertising, never sold to third parties, and never used to train AI models.</li>
            <li><b>Google AdSense &amp; Publisher Transparency:</b> Public editorial pages on our website comply fully with Google AdSense Programme Policies, the Google EU User Consent Policy, and international ePrivacy disclosures, while keeping the Orch desktop and mobile applications completely free of third-party advertising scripts.</li>
            <li><b>Global Privacy Rights:</b> We honor data access, portability, correction, and erasure requests from users worldwide under GDPR, UK GDPR, CCPA/CPRA, and applicable international privacy laws.</li>
          </ul>

          <h2>5. Contacting Orch</h2>
          <p>
            We welcome direct communication from developers, researchers, security auditors, press, and enterprise teams. Every message sent to our official contact address is reviewed directly by our core team:
          </p>
          <ul>
            <li><b>General Inquiries, Support &amp; Feedback:</b> <a href="mailto:sameer@orch.live">sameer@orch.live</a></li>
            <li><b>Privacy, Data Protection (DPO) &amp; OAuth Compliance:</b> <a href="mailto:sameer@orch.live">sameer@orch.live</a></li>
            <li><b>Security Advisories &amp; Responsible Disclosure:</b> <a href="mailto:sameer@orch.live">sameer@orch.live</a></li>
          </ul>
          <menu>
            <a href={DOWNLOAD_LINKS.macArm64} data-btn="hot">Download for macOS (ARM64)</a>
            <a href={DOWNLOAD_LINKS.macX64} data-btn>Download for macOS (Intel)</a>
            <a href={DOWNLOAD_LINKS.windowsExe} data-btn>Download for Windows</a>
          </menu>
        </article>

        <aside>
          <h2>Organization Details</h2>
          <p><b>Name:</b> Orch</p>
          <p><b>Founder &amp; Lead:</b> Sameer</p>
          <p><b>Contact Desk:</b> <a href="mailto:sameer@orch.live">sameer@orch.live</a></p>
          <p><b>Products:</b> Orch Desktop &amp; Orch Mobile (Upcoming)</p>
          <h2>Published Studies</h2>
          <PaperList />
          <h2>Legal &amp; Trust Center</h2>
          <menu>
            <Link href="/privacy" data-btn>Privacy Policy</Link>
            <Link href="/terms" data-btn>Terms of Service</Link>
            <Link href="/cookies" data-btn>Cookies &amp; AdSense</Link>
            <Link href="/security" data-btn>Security &amp; OAuth</Link>
          </menu>
        </aside>
      </div>

      <div data-split="news">
        <section>
          <h2>Receive our fortnightly research and product dispatch.</h2>
          <p>New Orch releases, mobile cloud session updates, and empirical research.</p>
        </section>
        <section><Subscribe /></section>
      </div>
    </main>
  )
}
