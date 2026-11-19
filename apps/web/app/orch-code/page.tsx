import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Subscribe } from '../../components/islands'
import { ConnectorGrid, Heat, JsonLd, PaperList } from '../../components/ui'
import { DOWNLOAD_LINKS, THINKING_MODES } from '../../lib/content'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Orch — Agentic Workspace for macOS & Windows',
  description:
    'Download Orch for macOS (Apple Silicon ARM64 & Intel x64) and Windows. Agentic coding workspace with GitHub, Drive, Gmail, Jira & Slack connectors, Low/Medium/High thinking modes, and $20/month free compute.',
  path: '/orch-code',
  image: '/images/orch-code-workspace.jpg',
  imageAlt: 'Orch Workspace for macOS and Windows',
  keywords: [
    'Orch',
    'download Orch',
    'Orch macOS ARM64',
    'Orch Windows',
    'agentic coding IDE',
    'free $20 AI compute',
    'Composio OAuth connectors',
  ],
})

const releaseChecks = [
  ['macOS Apple Silicon (ARM64)', 'Orch-macOS-arm64.dmg', 'Universal M1/M2/M3/M4 native binary', DOWNLOAD_LINKS.macArm64],
  ['macOS Intel (x64)', 'Orch-macOS-x64.dmg', 'Signed x86_64 disk image for Intel Macs', DOWNLOAD_LINKS.macX64],
  ['Windows (x64 Setup)', 'Orch-Windows-Setup.exe', 'Native Windows 10/11 desktop installer', DOWNLOAD_LINKS.windowsExe],
] as const

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'Orch', path: '/orch-code' },
])

export default function OrchCodePage() {
  return (
    <main id="top">
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="orch">
        <section>
          <h2 data-big>Orch</h2>
          <p>
            An autonomous agentic engineering workspace for macOS and Windows with native connectors, calibrated Low/Medium/High thinking modes, protected credentials, and <b>$20 every month in free compute</b> for every user.
          </p>
          <ul>
            <li><b>Agentic Workspace:</b> Deterministic worktree checkpoints, local call-graph indexing, and multi-file diff inspection inside a clean desktop interface.</li>
            <li><b>$20/Month Free Compute Included:</b> Every user automatically receives $20 of frontier model compute every month at $0 cost.</li>
            <li><b>Low / Medium / High Thinking Modes:</b> Control test-time reasoning depth per turn directly in the workspace selector.</li>
            <li><b>Native Connectors:</b> One-click OAuth connection to GitHub, Google Drive, Gmail, Jira, and Slack.</li>
            <li><b>Cloud Sessions (Coming Soon):</b> Offload long-running branches to isolated cloud sessions synced with Orch Mobile.</li>
          </ul>
          <menu>
            <a href={DOWNLOAD_LINKS.macArm64} data-btn="hot">Download macOS ARM64 (.dmg)</a>
            <a href={DOWNLOAD_LINKS.macX64} data-btn>Download macOS Intel x64 (.dmg)</a>
            <a href={DOWNLOAD_LINKS.windowsExe} data-btn>Download Windows Setup (.exe)</a>
          </menu>
        </section>
        <section>
          <figure aria-label="Orch interface">
            <header><small>Orch ($20.00 monthly credit)</small></header>
            <Image
              src="/images/orch-code-workspace.jpg"
              alt="Orch Desktop Workspace showing multi-file code diffs, reasoning depth selector, and system load"
              width={1280}
              height={720}
              priority
              referrerPolicy="no-referrer"
            />
            <p>Connect Jira &amp; Drive specs, refactor auth handoff, and verify all tests<span data-cursor /></p>
            <div>
              <b>Connector Context Linked</b>
              <small>GitHub, Drive, Gmail, Jira &amp; Slack</small>
              <p>Pulled acceptance criteria from <code>JIRA-409</code>, architecture spec from Google Drive, and customer trace from Gmail.</p>
            </div>
            <div>
              <b>Workspace Checkpoint #08</b>
              <small>0 compiler errors, 42 tests green</small>
              <p>Applied 6-file patch across auth callback and session store. Ready for one-click PR creation.</p>
            </div>
            <figcaption>Desktop application for macOS and Windows</figcaption>
          </figure>
        </section>
      </div>

      <dl>
        <div><dt>$20 / mo</dt><dd>free compute for every user, no cost</dd></div>
        <div><dt>Desktop</dt><dd>release for macOS &amp; Windows</dd></div>
        <div><dt>3 Modes</dt><dd>Low, Medium &amp; High thinking depth</dd></div>
        <div><dt>100%</dt><dd>protected local OS keychain storage</dd></div>
      </dl>

      <div data-split="research" id="downloads">
        <article>
          <h3>Download Orch for your architecture</h3>
          <p>
            All desktop installers are built directly from our verified release pipeline and include the local AST indexer, the <code>orch://</code> OAuth PKCE protocol handler, and instant activation of your $20/month free compute allocation.
          </p>
          <dl>
            <div><dt>ARM64</dt><dd>Apple M1, M2, M3, M4</dd></div>
            <div><dt>x86_64</dt><dd>Intel Mac &amp; Windows 10/11</dd></div>
            <div><dt>$0</dt><dd>free download + $20/mo credit</dd></div>
          </dl>
          <small>Published by Orch (sameer@orch.live)</small>
          <menu>
            <a href={DOWNLOAD_LINKS.macArm64} data-btn="hot">macOS Apple Silicon (.dmg)</a>
            <a href={DOWNLOAD_LINKS.macX64} data-btn>macOS Intel (.dmg)</a>
            <a href={DOWNLOAD_LINKS.windowsExe} data-btn>Windows Installer (.exe)</a>
          </menu>
        </article>
        <section>
          <header>
            <h2>Release builds &amp; platform targets</h2>
            <small>Desktop distribution</small>
          </header>
          <ol>
            {releaseChecks.map(([platform, file, desc, url]) => (
              <li key={file}>
                <small>{file}</small>
                <small>{platform}</small>
                <Heat n={5} />
                <a href={url}>{desc} — Download binary</a>
              </li>
            ))}
            <li>
              <small>orch-cloud-vm</small>
              <small>Coming Soon</small>
              <Heat n={4} />
              <Link href="/mobile">Cloud Sessions inside Orch Desktop &amp; Orch Mobile</Link>
            </li>
          </ol>
        </section>
      </div>

      <section id="connectors">
        <header>
          <h2>Native Workspace Connectors: GitHub, Google Drive, Gmail, Jira &amp; Slack</h2>
          <small>Powered by Composio &amp; Google OAuth 2.0 PKCE local handoffs</small>
        </header>
        <p>
          Stop copying and pasting ticket descriptions, RFC paragraphs, and stack traces between browser tabs. Orch connects directly to your engineering tools using least-privilege OAuth scopes and local keychain storage.
        </p>
        <ConnectorGrid />
        <menu>
          <Link href="/security" data-btn>Inspect OAuth &amp; Security Architecture</Link>
          <Link href="/blog/zero-trust-oauth-agent-connectors" data-btn>Read the Connector Paper (OR-015)</Link>
        </menu>
      </section>

      <div data-split="hero" id="thinking-modes">
        <section>
          <header>
            <h2>Calibrated Model with Low, Medium &amp; High Thinking Modes</h2>
            <small>Test-time compute under your explicit control</small>
          </header>
          <p>
            Not every engineering prompt requires twenty thousand tokens of internal deliberation. Orch lets you toggle reasoning depth per turn so you get instant edits when moving fast and exhaustive verification when touching critical infrastructure.
          </p>
          <dl>
            {THINKING_MODES.map((m) => (
              <div key={m.mode}>
                <dt>{m.mode}</dt>
                <dd><b>{m.budget} ({m.latency}).</b> {m.bestFor}</dd>
              </div>
            ))}
          </dl>
          <menu>
            <Link href="/blog/test-time-compute-thinking-modes" data-btn="hot">Read the Thinking Modes Benchmark</Link>
            <Link href="/blog/token-deflation-illusion-compute-costs" data-btn>Why Token Pricing is a Trick</Link>
          </menu>
        </section>
        <section>
          <header>
            <h2>Cloud Sessions (Coming Soon) &amp; Protected Privacy</h2>
            <small>Hardware-isolated micro-VMs + zero training guarantee</small>
          </header>
          <ul>
            <li><b>Cloud Sessions (Coming Soon in Desktop &amp; Mobile):</b> Push any local worktree to an ephemeral Firecracker micro-VM to run parallel agent branches and 30-minute test suites with your laptop closed.</li>
            <li><b>Every User Gets $20/Month Free:</b> Your monthly $20 compute credit works across Low, Medium, and High thinking modes with real-time cost readouts down to the tenth of a cent.</li>
            <li><b>Zero Training on Your Code:</b> Orch enforces strict zero-retention agreements across all model endpoints. Your proprietary repositories, Gmail threads, and Drive docs never enter training corpora.</li>
            <li><b>Protected Commit Gates:</b> External writes to GitHub, Jira, Gmail, or Slack require explicit human confirmation inside the Orch diff bar.</li>
          </ul>
          <PaperList limit={3} />
        </section>
      </div>

      <div data-split="news">
        <section>
          <h2>Get Orch release notes and Cloud Session beta invites.</h2>
          <p>Sent every other Friday from sameer@orch.live.</p>
        </section>
        <section><Subscribe /></section>
      </div>
    </main>
  )
}
