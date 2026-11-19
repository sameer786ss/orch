import type { Metadata } from 'next'
import type { BlogPost } from './blogs'

export const SITE_NAME = 'Orch'
export const SITE_URL = 'https://orch.live'
export const SITE_DOMAIN = 'orch.live'
export const DEFAULT_TITLE = 'Orch — Agentic Engineering Workspace & AI Systems Research Lab'
export const DEFAULT_DESCRIPTION =
  'Orch builds an agentic coding workspace for macOS & Windows with GitHub, Drive, Gmail, Jira & Slack connectors, Low/Medium/High thinking modes, $20/mo free compute, and empirical AI systems research.'
export const DEFAULT_OG_IMAGE = '/images/orch-code-workspace.jpg'
export const DEFAULT_OG_ALT =
  'Orch agentic engineering workspace for macOS and Windows'

export interface PageSeoConfig {
  title: string
  description: string
  path: string
  image?: string
  imageAlt?: string
  keywords?: string[]
  type?: 'website' | 'article'
  publishedTime?: string
  authors?: string[]
  noIndex?: boolean
}

export function buildPageMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  imageAlt = DEFAULT_OG_ALT,
  keywords,
  type = 'website',
  publishedTime,
  authors,
  noIndex = false,
}: PageSeoConfig): Metadata {
  const canonical = path === '/' ? SITE_URL : `${SITE_URL}${path}`
  const isHome = path === '/'
  const socialTitle = isHome || title.includes('| Orch') ? title : `${title} | ${SITE_NAME}`

  return {
    title: isHome ? { absolute: title } : title,
    description,
    applicationName: SITE_NAME,
    authors: (authors ?? [SITE_NAME]).map((name) => ({ name, url: SITE_URL })),
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'Developer Tools & Software Engineering Research',
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
    alternates: {
      canonical,
    },
    openGraph: {
      type,
      locale: 'en_US',
      url: canonical,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      images: [
        {
          url: image,
          width: 1280,
          height: 720,
          alt: imageAlt,
        },
      ],
      ...(type === 'article' && publishedTime
        ? {
            publishedTime,
            modifiedTime: publishedTime,
            authors: authors ?? [SITE_NAME],
            section: 'Software Engineering Research',
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      site: '@orch_live',
      creator: '@orch_live',
      title: socialTitle,
      description,
      images: [image],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        }
      : {
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
}

export const ROOT_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: ['Orch Labs', SITE_DOMAIN],
      url: `${SITE_URL}/`,
      inLanguage: 'en-US',
      description: DEFAULT_DESCRIPTION,
      publisher: {
        '@id': `${SITE_URL}/#organization`,
      },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: 'Orch Labs',
      url: `${SITE_URL}/`,
      email: 'sameer@orch.live',
      logo: {
        '@type': 'ImageObject',
        '@id': `${SITE_URL}/#logo`,
        url: `${SITE_URL}/icon-512.png`,
        contentUrl: `${SITE_URL}/icon-512.png`,
        width: 512,
        height: 512,
        caption: SITE_NAME,
      },
      image: `${SITE_URL}/icon-512.png`,
      description: DEFAULT_DESCRIPTION,
      sameAs: ['https://github.com/sameer786ss/orch'],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/orch-code/#software`,
      name: 'Orch',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS (Apple Silicon ARM64, Intel x64), Windows 10/11 (x64)',
      url: `${SITE_URL}/orch-code`,
      downloadUrl:
        'https://github.com/sameer786ss/orch/releases/latest/download/Orch-macOS-arm64.dmg',
      screenshot: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
      publisher: {
        '@id': `${SITE_URL}/#organization`,
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free desktop download with $20/month complimentary AI compute credit included',
      },
    },
  ],
}

export function buildBreadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.path === '/' ? SITE_URL : `${SITE_URL}${item.path}`,
    })),
  }
}

export function buildArticleJsonLd(post: BlogPost) {
  const articleUrl = `${SITE_URL}/blog/${post.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${articleUrl}#article`,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': articleUrl,
        },
        headline: post.title,
        alternativeHeadline: post.subtitle,
        description: post.excerpt,
        image: {
          '@type': 'ImageObject',
          url: `${SITE_URL}${post.image}`,
          width: 1280,
          height: 720,
        },
        datePublished: post.isoDate,
        dateModified: post.isoDate,
        inLanguage: 'en-US',
        author: {
          '@type': 'Organization',
          name: post.author,
          url: SITE_URL,
        },
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
        isPartOf: {
          '@id': `${SITE_URL}/#website`,
        },
      },
      buildBreadcrumbJsonLd([
        { name: 'Orch', path: '/' },
        { name: 'Research & Engineering Blog', path: '/blog' },
        { name: post.title, path: `/blog/${post.slug}` },
      ]),
    ],
  }
}
