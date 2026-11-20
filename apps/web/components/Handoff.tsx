'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { resolveHandoff, type HandoffKind, type HandoffState } from '../lib/handoff'

const COPY = {
  signin: {
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
  },
  connector: {
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
      working: 'Opening Orch Desktop to refresh your GitHub, Google Drive, Gmail, Jira, or Slack integration.',
      done: 'Your scoped OAuth connector is active inside your Orch workspace. You can close this tab.',
      error: 'There was a problem linking your external workspace connector to Orch.',
    },
    steps: [
      ['01', 'Browser', 'Provider completes OAuth consent and redirects back to Orch'],
      ['02', 'URI Scheme', 'Client scrubs query parameters from browser history'],
      ['03', 'Desktop', 'Orch Desktop receives completion status and activates the connector'],
    ],
  },
} as const

export function Handoff({ kind }: { kind: HandoffKind }) {
  const [state, setState] = useState<HandoffState>({ status: 'working' })
  const once = useRef(false)

  useEffect(() => {
    if (once.current) return
    once.current = true
    const next = resolveHandoff(kind, window.location.search)
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    if ('target' in next && next.target) {
      window.location.href = next.target
    }
    setState(next)
  }, [kind])

  const copy = COPY[kind]

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
              <dt>Desktop</dt>
              <dd>Orch Desktop ({copy.protocol})</dd>
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
          <p>The Orch web tier acts strictly as a stateless browser callback relay. Query parameters are scrubbed from browser history before returning control to Desktop over the registered URI scheme.</p>
          <ol>
            {copy.steps.map(([num, label, text]) => (
              <li key={num}>
                <small>{num}</small>
                <small>{label}</small>
                <Link href="/security">{text}</Link>
              </li>
            ))}
          </ol>
          <small>Need help with desktop callbacks? Contact <a href="mailto:sameer@orch.live">sameer@orch.live</a> or inspect our <Link href="/security">Security &amp; OAuth documentation</Link>.</small>
        </aside>
      </div>
    </main>
  )
}
