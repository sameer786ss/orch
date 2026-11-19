import { Fragment } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Subscribe } from '../../../components/islands'
import { Heat, JsonLd } from '../../../components/ui'
import { BLOG_POSTS, getBlogBySlug } from '../../../lib/blogs'
import { DOWNLOAD_LINKS } from '../../../lib/content'
import { buildArticleJsonLd, buildPageMetadata } from '../../../lib/seo'

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogBySlug(slug)
  if (!post) {
    return buildPageMetadata({
      title: 'Article Not Found',
      description: 'The requested Orch research report could not be found.',
      path: `/blog/${slug}`,
      noIndex: true,
    })
  }
  return buildPageMetadata({
    title: `${post.title} (${post.id})`,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.image,
    imageAlt: post.imageAlt,
    type: 'article',
    publishedTime: post.isoDate,
    authors: [post.author],
    keywords: ['Orch', post.id, post.kindLabel, post.author],
  })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getBlogBySlug(slug)
  if (!post) notFound()

  const others = BLOG_POSTS.filter((p) => p.slug !== post.slug)

  return (
    <main id="top">
      <JsonLd data={buildArticleJsonLd(post)} />

      <header data-article-header>
        <div data-article-meta>
          <Link href="/blog">All lab reports</Link>
          <span>/</span>
          <time dateTime={post.isoDate}>{post.date}</time>
          <span>({post.readMinutes} min read)</span>
        </div>

        <div data-article-top>
          <div data-article-title>
            <h1>{post.title}</h1>
            <p data-article-lead>{post.subtitle}</p>
            <dl>
              {post.metrics.map(([dt, dd]) => (
                <div key={dt}>
                  <dt>{dt}</dt>
                  <dd>{dd}</dd>
                </div>
              ))}
            </dl>
          </div>

          <figure aria-label={post.imageAlt}>
            <Image
              src={post.image}
              alt={post.imageAlt}
              width={1280}
              height={720}
              priority
              referrerPolicy="no-referrer"
            />
            <figcaption>{post.imageCaption}</figcaption>
          </figure>
        </div>

        <div data-article-byline>
          <span>
            By <b>{post.author}</b> ({post.authorRole}), {post.reads} reads
          </span>
          <Link href="/orch-code">Download Orch</Link>
        </div>
      </header>

      <div data-split="journal">
        <article>
          {post.sections.map((sec, idx) => (
            <Fragment key={sec.heading}>
              <h2 id={`section-${idx + 1}`}>{sec.heading}</h2>
              {sec.paragraphs.map((p, pIdx) => (
                <p key={pIdx}>{p}</p>
              ))}
              {sec.bullets && (
                <ul>
                  {sec.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </Fragment>
          ))}
          <h2 id="reproduce">Reproduce this in Orch</h2>
          <p>
            Every mechanism described in this report is shipped in Orch for macOS (Apple Silicon &amp; Intel) and Windows. Every user account includes $20/month in free compute credit across Low, Medium, and High thinking modes, plus native GitHub, Google Drive, Gmail, Jira, and Slack connectors.
          </p>
          <menu>
            <a href={DOWNLOAD_LINKS.macArm64} data-btn="hot">Download macOS ARM64 (.dmg)</a>
            <a href={DOWNLOAD_LINKS.macX64} data-btn>Download macOS Intel (.dmg)</a>
            <a href={DOWNLOAD_LINKS.windowsExe} data-btn>Download Windows Setup (.exe)</a>
          </menu>
        </article>

        <aside>
          <h2>In This Report</h2>
          <ul data-toc>
            {post.sections.map((sec, idx) => (
              <li key={sec.heading}>
                <a href={`#section-${idx + 1}`}>{sec.heading}</a>
              </li>
            ))}
            <li>
              <a href="#reproduce">Reproduce in Orch</a>
            </li>
          </ul>

          <h2>More from Orch Labs</h2>
          <ol>
            {others.map((o) => (
              <li key={o.id}>
                <small>{o.readMinutes} min</small>
                <Heat n={o.heat} />
                <Link href={`/blog/${o.slug}`}>{o.title}</Link>
              </li>
            ))}
          </ol>

          <h2>Orch</h2>
          <p>
            Agentic workspace with $20/mo free compute, Low/Medium/High thinking modes, and protected local OAuth connectors.
          </p>
          <menu>
            <Link href="/orch-code" data-btn="hot">Explore Orch</Link>
            <Link href="/mobile" data-btn>Orch Mobile</Link>
          </menu>
        </aside>
      </div>

      <div data-split="news">
        <section>
          <h2>Get the next Orch Labs technical report in your inbox.</h2>
          <p>Published every other Friday. Questions or peer review: sameer@orch.live.</p>
        </section>
        <section><Subscribe /></section>
      </div>
    </main>
  )
}
