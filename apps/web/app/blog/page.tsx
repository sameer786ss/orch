import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { DispatchBanner, DownloadButtons, Heat, JsonLd } from '../../components/ui'
import { BLOG_KIND_LABELS, BLOG_POSTS } from '../../lib/blogs'
import { JOURNAL_FILTERS } from '../../lib/content'
import { buildBreadcrumbJsonLd, buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'AI Systems Research & Engineering Blog — Agentic Harnesses & Compute Economics',
  description:
    'Empirical studies and engineering reports from Orch Labs on deterministic agentic harnesses, AI token pricing economics, test-time compute routing, zero-trust OAuth connectors, and cloud micro-VMs.',
  path: '/blog',
  image: '/images/blog-agentic-harness.jpg',
  imageAlt: 'Orch Research & Engineering Blog',
  keywords: [
    'Orch Research',
    'agentic harness architecture',
    'AI token pricing economics',
    'test-time compute thinking modes',
    'context rot 60-file repositories',
    'zero-trust OAuth connectors',
  ],
})

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: 'Orch', path: '/' },
  { name: 'Research & Engineering Blog', path: '/blog' },
])

export default function BlogIndexPage() {
  const featured = BLOG_POSTS[0]
  const secondFeatured = BLOG_POSTS[1]

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd} />
      <div data-split="hero">
        <article>
          <h1>{featured.title}</h1>
          <p>{featured.subtitle}</p>
          <dl data-metrics="">
            {featured.metrics.map(([dt, dd]) => (
              <div key={dt}>
                <dt>{dt}</dt>
                <dd>{dd}</dd>
              </div>
            ))}
          </dl>
          <small>By {featured.author} on {featured.date} ({featured.readMinutes} min read, {featured.reads} reads)</small>
          <menu>
            <Link href={`/blog/${featured.slug}`} data-btn="hot">Read full paper ({featured.readMinutes} min)</Link>
            <Link href={`/blog/${secondFeatured.slug}`} data-btn="">Token Pricing Study</Link>
          </menu>
        </article>
        <section data-hero-media="">
          <figure aria-label={featured.imageAlt}>
            <Image
              src={featured.image}
              alt={featured.imageAlt}
              width={1280}
              height={720}
              priority
            />
            <figcaption>{featured.imageCaption}</figcaption>
          </figure>
          <div data-subcard="">
            <h3>
              <Link href={`/blog/${secondFeatured.slug}`}>{secondFeatured.title}</Link>
            </h3>
            <small>By {secondFeatured.author} ({secondFeatured.readMinutes} min read, {secondFeatured.reads} reads)</small>
          </div>
        </section>
      </div>

      <div data-split="journal">
        <section>
          <header>
            <h2>All Orch Research &amp; Engineering Reports</h2>
            <small>{BLOG_POSTS.length} empirical papers</small>
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
                <menu>
                  <Link href={`/blog/${post.slug}`} data-btn="">Read report ({post.readMinutes} min)</Link>
                </menu>
              </div>
              <small>
                {BLOG_KIND_LABELS[post.kind]}<br />
                {post.date} ({post.readMinutes} min)<br />
                {post.reads} reads
              </small>
            </article>
          ))}
        </section>
        <aside>
          <h2>By Read Volume</h2>
          <ol>
            {BLOG_POSTS.map((post) => (
              <li key={post.id}>
                <small>{post.reads} reads</small>
                <Heat n={post.heat} />
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </li>
            ))}
          </ol>
          <h2>Try Orch</h2>
          <p>
            Every finding in these papers is compiled directly into the Orch agentic harness. Download for macOS or Windows and get $20/month free compute.
          </p>
          <DownloadButtons compact />
        </aside>
      </div>

      <DispatchBanner
        heading="Follow the Orch Research Dispatch."
        description="New agentic harness benchmarks and token economics audits every other Friday via sameer@orch.live."
      />
    </main>
  )
}
