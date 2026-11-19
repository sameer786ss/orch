'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { resolveHandoff, type HandoffKind, type HandoffState } from '../lib/handoff'

const COPY = {
  signin: {
    badge: 'Orch Desktop Authentication Handoff',
    protocol: 'orch://auth-callback',
    title: {
      working: 'Signing you in to Orch…',
      done: 'You are signed in to Orch',
      error: 'Sign-in handoff failed',
    },
    lede: {
      working: 'Verifying your OAuth authorization code and opening Orch Desktop.',
      done: 'Your session token has been handed off to the local Orch keychain. You can close this tab.',
      error: 'We could not complete the OAuth callback handoff to your local Orch installation.',
    },
  },
  connector: {
    badge: 'Orch Composio Connector Handoff',
    protocol: 'orch://oauth/composio',
    title: {
      working: 'Connecting workspace integration…',
      done: 'Workspace connector linked',
      error: 'Connector handoff failed',
    },
    lede: {
      working: 'Opening Orch Desktop to finalize your GitHub, Google Drive, Gmail, Jira, or Slack integration.',
      done: 'Your scoped OAuth connector is active inside your Orch agentic workspace. You can close this tab.',
      error: 'There was a problem linking your external workspace connector to Orch.',
    },
  },
} as const

export function Handoff({ kind }: { kind: HandoffKind }) {
  const [state, setState] = useState<HandoffState>({ status: 'working' })
  const once = useRef(false)

  useEffect(() => {
    if (once.current) return
    once.current = true
    const rawSearch = window.location.search
    if (!rawSearch) {
      setState({
        status: 'error',
        message: 'No authorisation code was received. Initiate the OAuth flow from Orch Desktop.',
      })
      return
    }
    const next = resolveHandoff(kind, rawSearch)
    window.history.replaceState(null, '', window.location.pathname)
    if ('target' in next && next.target) {
      window.location.href = next.target
    }
    setState(next)
  }, [kind])

  const copy = COPY[kind]

  return (
    <main id="top" aria-live="polite">
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

          <dl>
            <div>
              <dt>{kind === 'signin' ? 'OAuth 2.0' : 'Composio'}</dt>
              <dd>{copy.badge}</dd>
            </div>
            <div>
              <dt>PKCE</dt>
              <dd>Zero-retention local token exchange</dd>
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
            <Link href="/orch-code" data-btn>Orch Desktop</Link>
            <Link href="/" data-btn>Return to Orch home</Link>
          </menu>
        </article>

        <aside>
          <h2>How Orch Handoff works</h2>
          <p>Orch never stores your plaintext OAuth refresh tokens on a central multi-tenant server. Browser callbacks resolve locally over the registered custom URI scheme.</p>
          <ol>
            <li>
              <small>01</small>
              <small>Browser</small>
              <Link href="/security">Provider redirects to Orch callback route</Link>
            </li>
            <li>
              <small>02</small>
              <small>URI Scheme</small>
              <Link href="/security">Client strips query parameters from browser history</Link>
            </li>
            <li>
              <small>03</small>
              <small>Keychain</small>
              <Link href="/security">Orch Desktop completes PKCE exchange locally</Link>
            </li>
          </ol>
          <small>Need help with desktop callbacks? Contact <a href="mailto:sameer@orch.live">sameer@orch.live</a> or inspect our <Link href="/security">Security &amp; OAuth documentation</Link>.</small>
        </aside>
      </div>
    </main>
  )
}
