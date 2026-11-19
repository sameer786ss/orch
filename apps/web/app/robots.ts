import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/orch-code',
          '/mobile',
          '/blog',
          '/about',
          '/security',
          '/privacy',
          '/terms',
          '/cookies',
          '/favicon.ico',
          '/icon.svg',
          '/icon-192.png',
          '/icon-512.png',
          '/apple-touch-icon.png',
          '/orch-logo.svg',
          '/images/',
          '/connectors/',
        ],
        disallow: ['/auth-callback', '/composio', '/oauth/composio'],
      },
    ],
    sitemap: 'https://orch.live/sitemap.xml',
    host: 'https://orch.live',
  }
}
