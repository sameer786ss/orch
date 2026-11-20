import type { MetadataRoute } from 'next'
import { BLOG_POSTS } from '../lib/blogs'
import { SITE_URL } from '../lib/seo'

const STATIC_UPDATED = '2026-11-07'

export default function sitemap(): MetadataRoute.Sitemap {
  const latestPostDate = BLOG_POSTS[0]?.isoDate ?? STATIC_UPDATED

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: latestPostDate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/orch-code`, lastModified: STATIC_UPDATED, changeFrequency: 'weekly', priority: 0.95 },
    { url: `${SITE_URL}/mobile`, lastModified: STATIC_UPDATED, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: latestPostDate, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/security`, lastModified: STATIC_UPDATED, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: STATIC_UPDATED, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: STATIC_UPDATED, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/terms`, lastModified: STATIC_UPDATED, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/cookies`, lastModified: STATIC_UPDATED, changeFrequency: 'monthly', priority: 0.7 },
  ]

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.isoDate,
    changeFrequency: 'monthly',
    priority: 0.85,
  }))

  return [...staticRoutes, ...blogRoutes]
}
