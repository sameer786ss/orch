'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { resolveHandoff, type HandoffKind, type HandoffState } from '../lib/handoff'

function getCopy(kind: HandoffKind, appName: string) {
  if (kind === 'github') {
    return {
      badge: `Orch GitHub OAuth Handoff`,
      protocol: 'orch://oauth/github',
      method: 'GitHub OAuth',
      storage: 'Encrypted server token storage',
      title: {
        working: 'Connecting your GitHub account…',
        done: 'GitHub account linked',
        error: 'GitHub connection failed',
      },
      lede: {
        working: `Returning to ${appName} to refresh your GitHub accounts and repositories.`,
        done: `Your GitHub account is linked in ${appName}. You can close this tab.`,
        error: `There was a problem linking your GitHub account to ${appName}.`,
      },
      steps: [
        ['01', 'Browser', 'GitHub completes OAuth consent and exchanges the code on Orch Cloud'],
        ['02', 'URI Scheme', 'Client scrubs query parameters from browser history'],
        ['03', appName, `${appName} receives completion status and refreshes your GitHub projects`],
      ],
    } as const
  }
  if (kind === 'connector') {
    return {
      badge: 'Orch Composio Connector Handoff',
      protocol: 'orch://oauth/composio',
      method: 'Composio',
      storage: 'Scoped connector status handoff',
      title: {
        working: 'Connecting workspace integration…',
        done: 'Workspace connector linked',
        error: 'Connector handoff failed',
      },
      lede: {
        working: `Opening ${appName} to refresh your Google Drive, Gmail, Jira, or Slack integration.`,
        done: `Your scoped OAuth connector is active inside ${appName}. You can close this tab.`,
        error: `There was a problem linking your external connector to ${appName}.`,
      },
      steps: [
        ['01', 'Browser', 'Provider completes OAuth consent and redirects back to Orch'],
        ['02', 'URI Scheme', 'Client scrubs query parameters from browser history'],
        ['03', appName, `${appName} receives completion status and activates the connector`],
      ],
    } as const
  }
  return {
    badge: 'Orch Desktop Authentication Handoff',
    protocol: 'orch://auth-callback',
    method: 'OAuth 2.0',
    storage: 'OS keychain refresh token storage',
    title: {
      working: 'Signing you in to Orch…',
      done: 'You are signed in to Orch',
      error: 'Sign-in handoff failed',
    },
    lede: {
      working: 'Forwarding your OAuth authorization code to Orch Desktop.',
      done: 'Your authorization code has been handed off to Orch Desktop. You can close this tab.',
      error: 'We could not complete the OAuth callback handoff to your local Orch installation.',
    },
    steps: [
      ['01', 'Browser', 'Google redirects back to the Orch callback route'],
      ['02', 'URI Scheme', 'Client scrubs query parameters from browser history'],
      ['03', 'Keychain', 'Orch Desktop completes sign-in and seals your refresh token in OS keychain'],
    ],
  } as const
}

export function Handoff({ kind }: { kind: HandoffKind }) {
  const [state, setState] = useState<HandoffState>({ status: 'working' })
  const [appName, setAppName] = useState('Orch Desktop')
  const once = useRef(false)

  useEffect(() => {
    if (once.current) return
    once.current = true
    const params = new URLSearchParams(window.location.search)
    if (params.get('platform') === 'mobile') {
      setAppName('Orch Mobile')
    }
    const next = resolveHandoff(kind, window.location.search)
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    if ('target' in next && next.target) {
      window.location.href = next.target
    }
    setState(next)
  }, [kind])

  const copy = getCopy(kind, appName)

  return (
    <main aria-live="polite">
      <div data-split="hero">
        <article>
          <h1>{copy.title[state.status]}</h1>
          <p>{copy.lede[state.status]}</p>

          {state.status === 'error' && (
            <output role="alert">
              <s data-l="3" />
              <span><b>Callback diagnostic:</b> {state.message}</span>
            </output>
          )}

          <dl data-metrics="">
            <div>
              <dt>{copy.method}</dt>
              <dd>{copy.badge}</dd>
            </div>
            <div>
              <dt>Stateless</dt>
              <dd>{copy.storage}</dd>
            </div>
            <div>
              <dt>Client</dt>
              <dd>{appName} ({copy.protocol})</dd>
            </div>
          </dl>

          <menu>
            {state.status === 'done' && (
              <a href={state.target} data-btn="hot">Open Orch manually</a>
            )}
            {state.status === 'error' && state.target && (
              <a href={state.target} data-btn="hot">Return to Orch</a>
            )}
            <Link href="/orch-code" data-btn="">Orch Desktop</Link>
            <Link href="/" data-btn="">Return to Orch home</Link>
          </menu>
        </article>

        <aside>
          <h2>How Orch Handoff works</h2>
          <p>The Orch web tier acts strictly as a stateless browser callback relay. Query parameters are scrubbed from browser history before returning control to Orch over the registered URI scheme.</p>
          <ol>
            {copy.steps.map(([num, label, text]) => (
              <li key={num}>
                <small>{num}</small>
                <small>{label}</small>
                <Link href="/security">{text}</Link>
              </li>
            ))}
          </ol>
          <small>Need help with callbacks? Contact <a href="mailto:sameer@orch.live">sameer@orch.live</a> or inspect our <Link href="/security">Security &amp; OAuth documentation</Link>.</small>
        </aside>
      </div>
    </main>
  )
}
