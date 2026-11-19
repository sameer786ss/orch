import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Orch — Agentic Engineering Workspace & Research Lab',
    short_name: 'Orch',
    description:
      'Orch builds an agentic engineering workspace for macOS and Windows with GitHub, Drive, Gmail, Jira & Slack connectors, Low/Medium/High thinking modes, and $20/month free compute.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#11100F',
    theme_color: '#11100F',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '48x48 32x32 16x16',
        type: 'image/x-icon',
      },
      {
        src: '/icon.svg',
        sizes: '48x48 96x96 144x144 512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
