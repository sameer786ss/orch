import type { MetadataRoute } from 'next'
import { BLOG_POSTS } from '../lib/blogs'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://orch.live'
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: '2026-11-07',
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/orch-code`,
      lastModified: '2026-11-07',
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/mobile`,
      lastModified: '2026-11-07',
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: '2026-11-07',
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/security`,
      lastModified: '2026-11-07',
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: '2026-11-07',
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: '2026-11-07',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: '2026-11-07',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/cookies`,
      lastModified: '2026-11-07',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.isoDate,
    changeFrequency: 'monthly',
    priority: 0.85,
  }))

  return [...staticRoutes, ...blogRoutes]
}
