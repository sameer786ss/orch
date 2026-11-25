import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/auth-callback', '/composio', '/oauth/composio', '/oauth/github'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
