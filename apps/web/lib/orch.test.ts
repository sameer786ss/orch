import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveHandoff } from './handoff'
import { BLOG_POSTS, getBlogBySlug } from './blogs'
import { CONNECTORS, DOWNLOAD_LINKS, JOURNAL_FILTERS, THINKING_MODES, mostReadPosts, papers } from './content'
import { fmt, level, num, reads } from './heat'
import { buildArticleJsonLd, buildBreadcrumbJsonLd, buildPageMetadata, ROOT_JSON_LD, SITE_NAME, SITE_URL } from './seo'

test('resolveHandoff handles signin success and errors', () => {
  const ok = resolveHandoff('signin', '?code=abc123xyz&state=99')
  assert.equal(ok.status, 'done')
  if (ok.status === 'done') {
    assert.equal(ok.target, 'orch://auth-callback?code=abc123xyz&state=99')
  }

  const err = resolveHandoff('signin', '?error=access_denied&error_description=User+cancelled')
  assert.equal(err.status, 'error')
  if (err.status === 'error') {
    assert.equal(err.message, 'User cancelled')
  }

  const missing = resolveHandoff('signin', '')
  assert.equal(missing.status, 'error')
})

test('resolveHandoff handles composio connector callbacks', () => {
  const ok = resolveHandoff('connector', 'status=success')
  assert.equal(ok.status, 'done')
  if (ok.status === 'done') {
    assert.equal(ok.target, 'orch://oauth/composio?status=success')
  }

  const failed = resolveHandoff('connector', '?status=failed')
  assert.equal(failed.status, 'error')
  if (failed.status === 'error') {
    assert.equal(failed.target, 'orch://oauth/composio?status=failed')
  }
})

test('BLOG_POSTS has at least 6 complete research blogs with uniform metadata and derived content lists', () => {
  assert.equal(BLOG_POSTS.length >= 6, true)
  assert.equal(papers.length, BLOG_POSTS.length)
  assert.equal(mostReadPosts.length, 4)
  assert.equal(JOURNAL_FILTERS.length, 5)
  for (const post of BLOG_POSTS) {
    assert.equal(Boolean(post.slug && post.title && post.image && post.isoDate && post.status), true)
    assert.equal(post.sections.length >= 3, true)
    assert.equal(getBlogBySlug(post.slug)?.id, post.id)
  }
})

test('DOWNLOAD_LINKS and CONNECTORS match Orch specification', () => {
  assert.equal(
    DOWNLOAD_LINKS.macArm64,
    'https://github.com/sameer786ss/orch/releases/latest/download/Orch-macOS-arm64.dmg'
  )
  assert.equal(
    DOWNLOAD_LINKS.macX64,
    'https://github.com/sameer786ss/orch/releases/latest/download/Orch-macOS-x64.dmg'
  )
  assert.equal(
    DOWNLOAD_LINKS.windowsExe,
    'https://github.com/sameer786ss/orch/releases/latest/download/Orch-Windows-Setup.exe'
  )
  assert.equal(CONNECTORS.length, 5)
  assert.equal(THINKING_MODES.length, 3)
})

test('SEO metadata and JSON-LD builders preserve Site Name Orch and 512x512 logo across all pages', () => {
  const subpageMeta = buildPageMetadata({
    title: 'Orch',
    description: 'Agentic workspace for macOS and Windows.',
    path: '/orch-code',
  })
  assert.equal(subpageMeta.applicationName, SITE_NAME)
  assert.equal(subpageMeta.openGraph?.siteName, SITE_NAME)
  assert.equal(subpageMeta.alternates?.canonical, `${SITE_URL}/orch-code`)

  const websiteNode = ROOT_JSON_LD['@graph'][0] as { name: string; alternateName: string[] }
  assert.equal(websiteNode.name, 'Orch')
  assert.equal(websiteNode.alternateName.includes('orch.live'), true)

  const orgNode = ROOT_JSON_LD['@graph'][1] as { logo: { url: string; width: number; height: number } }
  assert.equal(orgNode.logo.url, 'https://orch.live/icon-512.png')
  assert.equal(orgNode.logo.width, 512)
  assert.equal(orgNode.logo.height, 512)

  const articleLd = buildArticleJsonLd(BLOG_POSTS[0])
  assert.equal(Array.isArray(articleLd['@graph']), true)
  const crumbLd = buildBreadcrumbJsonLd([{ name: 'Orch', path: '/' }])
  assert.equal(crumbLd['@type'], 'BreadcrumbList')
})

test('heat map helpers produce deterministic values', () => {
  assert.equal(reads.length, 363)
  assert.equal(level(25000), 4)
  assert.equal(level(7000), 3)
  assert.equal(level(3500), 2)
  assert.equal(level(400), 1)
  assert.equal(level(50), 0)
  assert.equal(num(24890), '24,890')
  assert.equal(typeof fmt(0), 'string')
})
