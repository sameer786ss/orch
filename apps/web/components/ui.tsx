import Image from 'next/image'
import Link from 'next/link'
import { CONNECTORS, papers } from '../lib/content'

export const Heat = ({ n }: { n: number }) => (
  <span data-heat role="img" aria-label={`Heat ${n} of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <s key={i} data-on={i <= n || undefined} />
    ))}
  </span>
)

export const ConnectorGrid = () => (
  <dl>
    {CONNECTORS.map((c) => (
      <div key={c.id}>
        <Image
          src={c.icon}
          alt={`${c.name} connector logo`}
          width={28}
          height={28}
          referrerPolicy="no-referrer"
        />
        <dt>{c.name}</dt>
        <dd>
          <b>{c.scope}.</b> {c.summary}
        </dd>
      </div>
    ))}
  </dl>
)

export const PaperList = ({ limit }: { limit?: number }) => {
  const list = limit ? papers.slice(0, limit) : papers
  return (
    <ol>
      {list.map(([id, status, title, heat, href]) => (
        <li key={id}>
          <small>{id}</small>
          <small>{status[0].toUpperCase() + status.slice(1)}</small>
          <Heat n={heat} />
          <Link href={href}>{title}</Link>
        </li>
      ))}
    </ol>
  )
}

const LEGAL_LINKS = [
  { key: 'privacy', label: 'Privacy Policy & Google Limited Use', href: '/privacy', defaultStatus: 'Active' },
  { key: 'terms', label: 'Terms of Service & $20/mo Grant', href: '/terms', defaultStatus: 'Active' },
  { key: 'cookies', label: 'Cookie & Google AdSense Policy', href: '/cookies', defaultStatus: 'Active' },
  { key: 'security', label: 'Security & OAuth Governance', href: '/security', defaultStatus: 'Verified' },
] as const

export const LegalHubList = ({ current }: { current: 'privacy' | 'terms' | 'cookies' | 'security' }) => (
  <ol>
    {LEGAL_LINKS.map((item) => (
      <li key={item.key}>
        <small>{item.key === current ? 'Current' : item.defaultStatus}</small>
        <Link href={item.href}>{item.label}</Link>
      </li>
    ))}
  </ol>
)

export const JsonLd = ({ data }: { data: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
  />
)
