import type { Metadata } from 'next'
import { Handoff } from '../../../components/Handoff'
import { buildPageMetadata } from '../../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Connecting Workspace to Orch',
  description: 'Completing Composio OAuth connector handoff to the Orch desktop application.',
  path: '/oauth/composio',
  noIndex: true,
})

export default function OAuthComposioCallbackPage() {
  return <Handoff kind="connector" />
}
