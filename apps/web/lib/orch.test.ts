import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveHandoff } from './handoff'
import { BLOG_KIND_LABELS, BLOG_POSTS, getBlogBySlug } from './blogs'
import { CONNECTORS, DOWNLOAD_LINKS, JOURNAL_FILTERS, THINKING_MODES, mostReadPosts, newest, papers } from './content'
import { fmt, level, N, num, reads } from './heat'
import { buildArticleJsonLd, buildBreadcrumbJsonLd, buildPageMetadata, ROOT_JSON_LD, SITE_NAME, SITE_URL } from './seo'

test('resolveHandoff handles signin success, provider errors, and missing params', () => {
  const ok = resolveHandoff('signin', '?code=abc123xyz&state=99')
  assert.equal(ok.status, 'done')
  if (ok.status === 'done') {
    assert.equal(ok.target, 'orch://auth-callback?code=abc123xyz&state=99')
  }

  const err = resolveHandoff('signin', '?error=access_denied&error_description=User+cancelled')
  assert.equal(err.status, 'error')
  if (err.status === 'error') {
    assert.equal(err.message, 'User cancelled')
    assert.equal(err.target, 'orch://auth-callback?error=access_denied&error_description=User+cancelled')
  }

  const missing = resolveHandoff('signin', '')
  assert.equal(missing.status, 'error')
  if (missing.status === 'error') {
    assert.equal(missing.target, undefined)
  }
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

  const empty = resolveHandoff('connector', '')
  assert.equal(empty.status, 'error')
  if (empty.status === 'error') {
    assert.equal(empty.message.includes('status'), true)
  }
})

test('resolveHandoff handles github oauth callbacks', () => {
  const ok = resolveHandoff('github', '?status=success&platform=mobile&login=alice')
  assert.equal(ok.status, 'done')
  if (ok.status === 'done') {
    assert.equal(ok.target, 'orch://oauth/github?status=success&login=alice')
  }

  const failed = resolveHandoff('github', '?status=failed&message=Denied')
  assert.equal(failed.status, 'error')
  if (failed.status === 'error') {
    assert.equal(failed.message, 'Denied')
    assert.equal(failed.target, 'orch://oauth/github?status=failed&message=Denied')
  }

  const empty = resolveHandoff('github', '')
  assert.equal(empty.status, 'error')
})

test('BLOG_POSTS has 6 complete research blogs with derived content lists', () => {
  assert.equal(BLOG_POSTS.length, 6)
  assert.equal(papers.length, BLOG_POSTS.length)
  assert.equal(newest.length, 4)
  assert.equal(mostReadPosts.length, 4)
  assert.equal(JOURNAL_FILTERS.length, 5)
  for (const post of BLOG_POSTS) {
    assert.equal(Boolean(post.slug && post.title && post.image && post.isoDate && post.status), true)
    assert.equal(Boolean(BLOG_KIND_LABELS[post.kind]), true)
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
  assert.equal(CONNECTORS.length, 4)
  assert.equal(THINKING_MODES.length, 3)
})

test('SEO metadata and JSON-LD builders preserve Site Name Orch, 512x512 logo, and clean @graph', () => {
  const subpageMeta = buildPageMetadata({
    title: 'Desktop Workspace for macOS & Windows',
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
  assert.equal('@context' in articleLd['@graph'][1], false)
  const crumbLd = buildBreadcrumbJsonLd([{ name: 'Orch', path: '/' }])
  assert.equal(crumbLd['@type'], 'BreadcrumbList')
})

test('heat map helpers produce deterministic 52-week grid values', () => {
  assert.equal(N, 364)
  assert.equal(reads.length, N)
  assert.equal(level(25000), 4)
  assert.equal(level(7000), 3)
  assert.equal(level(3500), 2)
  assert.equal(level(400), 1)
  assert.equal(level(50), 0)
  assert.equal(num(24890), '24,890')
  assert.equal(typeof fmt(0), 'string')
})
