import type { Metadata } from 'next'
import { Handoff } from '../../components/Handoff'
import { buildPageMetadata } from '../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Signing in to Orch',
  description: 'Completing Google OAuth authentication handoff to the Orch desktop application.',
  path: '/auth-callback',
  noIndex: true,
})

export default function AuthCallbackPage() {
  return <Handoff kind="signin" />
}
