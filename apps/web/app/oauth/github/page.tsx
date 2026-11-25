import type { Metadata } from 'next'
import { Handoff } from '../../../components/Handoff'
import { buildPageMetadata } from '../../../lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Connecting GitHub to Orch',
  description: 'Completing native GitHub OAuth handoff to Orch.',
  path: '/oauth/github',
  noIndex: true,
})

export default function OAuthGithubCallbackPage() {
  return <Handoff kind="github" />
}
