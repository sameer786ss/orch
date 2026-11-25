import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { HeatMap } from '../components/HeatMap'
import { ConnectorGrid, DispatchBanner, DownloadButtons, Heat, PaperList } from '../components/ui'
import { BLOG_KIND_LABELS, BLOG_POSTS } from '../lib/blogs'
import { JOURNAL_FILTERS, mostReadPosts, newest } from '../lib/content'
import { buildPageMetadata, DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: '/',
  keywords: [
    'Orch',
    'agentic engineering workspace',
    'AI coding agent macOS Windows',
    'deterministic agentic harness',
    'test-time compute thinking modes',
    'AI token pricing economics',
    'OAuth workspace connectors',
  ],
})

export default function Home() {
  const tokenStudy = BLOG_POSTS[1]

  return (
    <main>
      <div data-split="hero">
        <section>
          <h1>We research agentic harnesses, audit AI compute economics, and ship Orch.</h1>
          <p>
            Orch is an independent engineering lab. Every benchmark ships with its harness trace, every study exposes what model pricing hides, and the <b>Orch desktop app</b> gives every developer an agentic workspace with native GitHub repositories, Drive, Gmail, Jira, and Slack connectors, Low/Medium/High thinking modes, and <b>$20/month in free compute</b> at zero cost.
          </p>
          <menu>
            <Link href="/orch-code" data-btn="hot">Download Orch</Link>
            <Link href="/blog" data-btn="">Read the {BLOG_POSTS.length} Lab Reports</Link>
            <Link href="/mobile" data-btn="">Orch Mobile (Upcoming)</Link>
          </menu>
        </section>
        <section data-hero-media="">
          <div>
            <header>
              <h2>Newest from Orch Labs</h2>
              <small>Reads this month</small>
            </header>
            <ol>
              {newest.map(([d, k, t, n, href]) => (
                <li key={t}>
                  <time>{d}</time>
                  <small>{k}</small>
                  <Heat n={n} />
                  <Link href={href}>{t}</Link>
                </li>
              ))}
            </ol>
          </div>
          <div data-subcard="">
            <small>Open-Access Benchmark Archive</small>
            <h3>
              <Link href="/blog">Browse all {BLOG_POSTS.length} research papers and harness traces</Link>
            </h3>
          </div>
        </section>
      </div>

      <section>
        <header>
          <h2>Everything Orch published and shipped in the last 52 weeks, one square per day</h2>
          <small>
            Fewer reads <s data-l="0" /><s data-l="1" /><s data-l="2" /><s data-l="3" /><s data-l="4" /> More reads
          </small>
        </header>
        <HeatMap />
      </section>

      <div data-split="orch">
        <section>
          <h2 data-big="">Orch</h2>
          <p>The protected agentic workspace for macOS and Windows. Connect your tools, pick your thinking depth, and ship verified diffs.</p>
          <ul>
            <li><b>Every user gets $20/month free compute:</b> Automatic monthly reset, no credit card traps, transparent token accounting.</li>
            <li><b>Low / Medium / High thinking modes:</b> Route test-time compute per turn, from 1.4s edits in Low to formal verification in High.</li>
            <li><b>Native workspace connectors:</b> Link GitHub, Google Drive, Gmail, Jira, and Slack via system-browser OAuth and stateless <code>orch://</code> handoffs.</li>
            <li><b>Cloud Sessions (Coming Soon) &amp; Mobile:</b> Offload long test runs to isolated micro-VMs and steer them from the upcoming Orch Mobile app.</li>
          </ul>
          <DownloadButtons>
            <Link href="/orch-code" data-btn="">Explore Orch</Link>
          </DownloadButtons>
        </section>
        <section>
          <figure aria-label="Orch agentic workspace">
            <header><small>Orch ($20.00 monthly credit active)</small></header>
            <Image
              src="/images/orch-code-workspace.jpg"
              alt="Orch agentic workspace showing multi-file diff inspection and Low Medium High thinking mode selector"
              width={1280}
              height={720}
              priority
            />
            <p>Review Jira ORCH-89 &amp; Drive RFC, then patch the OAuth handoff flow<span data-cursor="" /></p>
            <div>
              <b>GitHub #412 + Jira ORCH-89</b>
              <small>Checkpoint verified in 1.2s</small>
              <p>Cross-referenced Google Drive spec with Gmail escalation thread; patched callback handler in <code>lib/handoff.ts</code>.</p>
            </div>
            <div>
              <b>High thinking mode</b>
              <small>$0.09 used from $20.00 free monthly credit</small>
              <p>Zero regressions across 48 unit tests. Ready to post summary to <code>#eng-releases</code> on Slack.</p>
            </div>
            <figcaption>Orch for macOS and Windows</figcaption>
          </figure>
        </section>
      </div>

      <dl>
        <div><dt>$20 / mo</dt><dd>free compute for every user, zero cost</dd></div>
        <div><dt>3 Modes</dt><dd>Low, Medium &amp; High test-time thinking</dd></div>
        <div><dt>4 Connectors</dt><dd>Drive, Gmail, Jira &amp; Slack plus native GitHub</dd></div>
        <div><dt>Desktop</dt><dd>macOS (ARM64/x64) &amp; Windows</dd></div>
      </dl>

      <section>
        <header>
          <h2>Protected Workspace Connectors in Orch</h2>
          <small>System-browser OAuth &amp; Composio handoffs via orch:// protocol</small>
        </header>
        <p>
          Orch connects directly to your GitHub repositories and collaboration tools. Sign-in refresh tokens are sealed in your OS keychain via <code>orch://auth-callback</code>, GitHub OAuth returns via <code>orch://oauth/github</code>, and scoped connector completions hand back via <code>orch://oauth/composio</code>.
        </p>
        <ConnectorGrid />
      </section>

      <div data-split="research">
        <article>
          <h3>{tokenStudy.title}</h3>
          <p>
            Across 80,000 autonomous coding turns and 64 engineering teams, we audited why 78% reductions in headline per-million input token prices resulted in a 2.3x increase in monthly invoice spend. Hidden chain-of-thought output multipliers, quadratic multi-turn prefill, and 5-minute prompt cache evictions transfer the cost onto the developer.
          </p>
          <dl data-metrics="">
            <div><dt>-78%</dt><dd>headline input price cut</dd></div>
            <div><dt>+134%</dt><dd>median spend per merged PR</dd></div>
            <div><dt>64%</dt><dd>tokens saved by Orch harness</dd></div>
          </dl>
          <small>By {tokenStudy.author} on {tokenStudy.date} ({tokenStudy.readMinutes} min read)</small>
          <menu>
            <Link href={`/blog/${tokenStudy.slug}`} data-btn="hot">Read the full study</Link>
            <Link href="/blog/agentic-harness-architecture" data-btn="">Read Harness Paper</Link>
            <Link href="/orch-code" data-btn="">Claim $20/mo Free Compute</Link>
          </menu>
        </article>
        <section>
          <header>
            <h2>Research &amp; Technical Reports</h2>
            <small>{BLOG_POSTS.length} empirical studies, newest first</small>
          </header>
          <PaperList />
        </section>
      </div>

      <div data-split="journal">
        <section>
          <header>
            <h2>Orch Journal &amp; Engineering Blogs</h2>
            <small>Empirical reports written by the engineers who built the harness</small>
          </header>
          <fieldset>
            <legend>Filter by type</legend>
            {JOURNAL_FILTERS.map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="type" value={v} defaultChecked={v === 'all'} />
                {l}
              </label>
            ))}
          </fieldset>
          {BLOG_POSTS.map((post) => (
            <article key={post.slug} data-t={post.kind}>
              <div>
                <h3><Link href={`/blog/${post.slug}`}>{post.title}</Link></h3>
                <p>{post.excerpt}</p>
              </div>
              <small>{BLOG_KIND_LABELS[post.kind]}<br />{post.date} ({post.readMinutes} min)</small>
            </article>
          ))}
        </section>
        <aside>
          <h2>Most read this month</h2>
          <ol>
            {mostReadPosts.map((post) => (
              <li key={post.slug}>
                <small>{post.reads} reads</small>
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </li>
            ))}
          </ol>
          <h2>Upcoming: Orch Mobile</h2>
          <p>
            Complete Cloud Session companion app. Spawn isolated micro-VMs, inspect branch diffs, and steer Low/Medium/High agent runs from anywhere.
          </p>
          <progress max="100" value="78">78%</progress>
          <menu>
            <Link href="/mobile" data-btn="">Preview Orch Mobile</Link>
          </menu>
        </aside>
      </div>

      <DispatchBanner
        heading="One dispatch every other Friday. Benchmarks, harness releases, and zero fluff."
        description="Write to sameer@orch.live to join the Orch engineering dispatch or submit peer review."
      />
    </main>
  )
}
