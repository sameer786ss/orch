import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import Link from 'next/link'
import { JsonLd } from '../components/ui'
import { DOWNLOAD_LINKS } from '../lib/content'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_ALT,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  ROOT_JSON_LD,
  SITE_NAME,
  SITE_URL,
} from '../lib/seo'
import './globals.css'

const sans = localFont({ src: './fonts/bricolage.woff2', variable: '--f', weight: '200 800' })
const mono = localFont({ src: './fonts/jetbrains-mono.woff2', variable: '--m', weight: '100 800' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
      { url: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1280,
        height: 720,
        alt: DEFAULT_OG_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@orch_live',
    creator: '@orch_live',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = { themeColor: '#11100F', colorScheme: 'dark', viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <JsonLd data={ROOT_JSON_LD} />
        <header>
          <Link href="/" aria-label="Orch home">
            <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">
              <path d="M11 0c1 6 9 8 9 15a9 9 0 0 1-18 0c0-4 2-6 4-8 0 3 1 5 3 5 0-5 1-8 2-12z" fill="#F2643D" />
            </svg>
            Orch
          </Link>
          <nav aria-label="Sections">
            <Link href="/orch-code">Desktop</Link>
            <Link href="/mobile">Mobile</Link>
            <Link href="/blog">Blog</Link>
          </nav>
          <Link href="/orch-code" data-btn="hot">Get Orch</Link>
        </header>
        <aside>
          <p>
            <span>
              <b>New Release:</b> Orch is live for macOS &amp; Windows with $20/month free compute.
            </span>
            <Link href="/orch-code">Download</Link>
          </p>
        </aside>
        {children}
        <footer>
          <div>
            <b>Orch</b>
            <Link href="/orch-code">Desktop</Link>
            <Link href="/mobile">Orch Mobile (Upcoming)</Link>
            <a href={DOWNLOAD_LINKS.macArm64}>macOS Apple Silicon</a>
            <a href={DOWNLOAD_LINKS.macX64}>macOS Intel x64</a>
            <a href={DOWNLOAD_LINKS.windowsExe}>Windows Setup</a>
          </div>
          <div>
            <b>Research</b>
            <Link href="/blog">All Lab Reports</Link>
            <Link href="/blog/agentic-harness-architecture">Agentic Harnesses</Link>
            <Link href="/blog/token-deflation-illusion-compute-costs">Token Pricing Economics</Link>
            <Link href="/blog/test-time-compute-thinking-modes">Thinking Modes</Link>
          </div>
          <div>
            <b>Legal</b>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/cookies">Cookies &amp; AdSense</Link>
            <Link href="/security">Security</Link>
          </div>
          <div>
            <b>Lab</b>
            <Link href="/about">About Orch</Link>
            <Link href="/about">Contact</Link>
            <Link href="/sitemap.xml">Sitemap</Link>
          </div>
          <small>© 2026 Orch. Independent agentic engineering lab.</small>
        </footer>
      </body>
    </html>
  )
}
