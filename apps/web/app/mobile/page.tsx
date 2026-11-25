import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ConnectorGrid, DispatchBanner, DownloadButtons, Heat, JsonLd } from '../../components/ui'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Orch Mobile (Upcoming) — Cloud Session Engineering App',
  description:
    'Orch Mobile is our upcoming Cloud Session companion app. Spawn isolated micro-VMs on your GitHub repositories, steer Low/Medium/High thinking runs, and review Drive, Gmail, Jira & Slack workflows from anywhere.',
  path: '/mobile',
  image: '/images/orch-mobile-cloud.jpg',
  imageAlt: 'Orch Mobile Cloud Session App',
  keywords: [
    'Orch Mobile',
    'cloud coding sessions Android',
    'ephemeral Firecracker micro-VM',
    'mobile agentic engineering',
  ],
})

const roadmap = [
  ['MS-01', 'Published', 'Ephemeral Firecracker micro-VM snapshot engine & delta git sync', 5],
  ['MS-02', 'Published', 'Shared $20/mo free compute ledger & Low/Medium/High thinking router', 5],
  ['MS-03', 'Release', 'Mobile structural diff viewer & one-tap tool approval gates', 4],
  ['MS-04', 'Preprint', 'Android APK preview packaging & beta distribution (In active works)', 4],
] as const

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'Orch Mobile', path: '/mobile' },
])

export default function OrchMobilePage() {
  return (
    <main>
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="orch">
        <section>
          <h1 data-big="">Orch Mobile</h1>
          <p>
            A complete Cloud Session engineering app. Start a refactor at your desk or spawn a fresh cloud micro-VM from your phone without touching a thumb keyboard to write boilerplate.
          </p>
          <ul>
            <li><b>100% Cloud Session Native:</b> Every session runs inside a dedicated, hardware-isolated cloud micro-VM with full compiler, Docker, and test runner support.</li>
            <li><b>Seamless Desktop Handoff:</b> Promote any active worktree from Orch Desktop to the cloud in under a second and monitor progress on the move.</li>
            <li><b>Same Low / Medium / High Thinking Model:</b> Switch reasoning depth per turn and draw from the exact same <b>$20/month free compute</b> grant included with your Orch account.</li>
            <li><b>Full Connector Context on Mobile:</b> Attach Jira issues, Google Drive specs, Gmail bug reports, and Slack threads, then merge the verified GitHub PR with one tap.</li>
          </ul>
          <menu>
            <a href="#notify" data-btn="hot">Join Mobile Early Access</a>
            <Link href="/orch-code" data-btn="">Download Desktop Now</Link>
            <Link href="/blog/cloud-sessions-ephemeral-microvms" data-btn="">Read Cloud VM Architecture</Link>
          </menu>
        </section>
        <section>
          <figure aria-label="Orch Mobile cloud session preview">
            <header><small>Orch Mobile Cloud Session ($20/mo free credit)</small></header>
            <Image
              src="/images/orch-mobile-cloud.jpg"
              alt="Orch Mobile running a live cloud coding session on a matte black smartphone"
              width={1280}
              height={720}
              priority
            />
            <p>Resume cloud session on branch feat/oauth-handoff and open GitHub PR<span data-cursor="" /></p>
            <div>
              <b>Cloud Enclave Online (380ms boot)</b>
              <small>4 vCPU, 8 GB RAM, Isolated Kernel</small>
              <p>Synced worktree delta from Orch Desktop. Running 142 integration tests in background.</p>
            </div>
            <div>
              <b>Approval Gate Ready</b>
              <small>GitHub PR #418 + Slack #releases</small>
              <p>All checks passed. Tap to open GitHub Pull Request and notify engineering channel.</p>
            </div>
            <figcaption>Orch Mobile (Upcoming)</figcaption>
          </figure>
        </section>
      </div>

      <dl>
        <div><dt>380 ms</dt><dd>cloud micro-VM warm resume</dd></div>
        <div><dt>$20 / mo</dt><dd>shared free compute credit every month</dd></div>
        <div><dt>4 Connectors</dt><dd>Drive, Gmail, Jira &amp; Slack + GitHub OAuth</dd></div>
        <div><dt>Android</dt><dd>upcoming preview under active works</dd></div>
      </dl>

      <div data-split="research">
        <article>
          <h3>Why we built Orch Mobile around Cloud Sessions instead of a tiny code editor</h3>
          <p>
            Trying to type syntax on a glass phone screen is a solved anti-pattern. Real mobile engineering happens when an autonomous harness runs your compiler and test suite inside a cloud micro-VM while you steer architecture, connect Jira or Slack context, inspect clean structural diffs, and approve gated actions.
          </p>
          <dl data-metrics="">
            <div><dt>0% CPU</dt><dd>drain on your local battery</dd></div>
            <div><dt>100%</dt><dd>ephemeral disk wipe on session close</dd></div>
            <div><dt>3 Modes</dt><dd>Low, Medium &amp; High thinking</dd></div>
          </dl>
          <small>Need Desktop today? Orch is available right now for macOS and Windows.</small>
          <DownloadButtons compact />
        </article>
        <section>
          <header>
            <h2>Orch Mobile &amp; Cloud Session engineering milestones</h2>
            <small>78% complete toward preview build</small>
          </header>
          <progress max="100" value="78">78%</progress>
          <ol>
            {roadmap.map(([id, status, title, heat]) => (
              <li key={id}>
                <small>{id}</small>
                <small>{status}</small>
                <Heat n={heat} />
                <Link href="/blog/cloud-sessions-ephemeral-microvms">{title}</Link>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section>
        <header>
          <h2>Connectors available inside Cloud Sessions</h2>
          <small>Scoped per session with explicit write-approval gates on mobile</small>
        </header>
        <ConnectorGrid />
      </section>

      <DispatchBanner
        id="notify"
        heading="Get notified the day Orch Mobile preview builds drop."
        description="We only email when new binaries or research papers ship. Contact: sameer@orch.live."
        subject="Orch Mobile Early Access"
        cta="Request Early Access"
      />
    </main>
  )
}
