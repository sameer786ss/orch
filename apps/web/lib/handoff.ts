export type HandoffKind = 'signin' | 'connector' | 'github'

export type HandoffState =
  | { status: 'working' }
  | { status: 'done'; target: string }
  | { status: 'error'; message: string; target?: string }

const CONNECTOR_TARGET = 'orch://oauth/composio'
const GITHUB_TARGET = 'orch://oauth/github'
const SIGNIN_TARGET = 'orch://auth-callback'

export function resolveHandoff(kind: HandoffKind, search: string): HandoffState {
  const normalizedSearch = search.startsWith('?') ? search : search ? `?${search}` : ''
  const params = new URLSearchParams(normalizedSearch)

  if (kind === 'github') {
    const status = params.get('status')
    if (status !== 'success' && status !== 'failed') {
      return {
        status: 'error',
        message: 'The GitHub authorization response was incomplete. Start it again from Orch.',
      }
    }
    const query = new URLSearchParams({ status })
    const login = params.get('login')?.trim()
    const message = params.get('message')?.trim()
    if (login) query.set('login', login)
    if (message) query.set('message', message)
    if (status === 'success') {
      return { status: 'done', target: `${GITHUB_TARGET}?${query.toString()}` }
    }
    return {
      status: 'error',
      message: message || 'GitHub connection was not completed. Start it again from Orch.',
      target: `${GITHUB_TARGET}?${query.toString()}`,
    }
  }

  if (kind === 'connector') {
    const status = params.get('status')
    if (status !== 'success' && status !== 'failed') {
      return {
        status: 'error',
        message: 'The connection response was missing its status. Start it again from Orch.',
      }
    }
    if (status === 'success') {
      return { status: 'done', target: `${CONNECTOR_TARGET}?status=success` }
    }
    return {
      status: 'error',
      message: 'The connection was not completed. Start it again from Orch.',
      target: `${CONNECTOR_TARGET}?status=failed`,
    }
  }

  const error = params.get('error')
  const errorDescription = params.get('error_description')
  if (error && error.trim().length > 0) {
    return {
      status: 'error',
      message: errorDescription && errorDescription.trim().length > 0 ? errorDescription : error,
      target: `${SIGNIN_TARGET}${normalizedSearch}`,
    }
  }

  const code = params.get('code')
  if (code && code.trim().length > 0) {
    return {
      status: 'done',
      target: `${SIGNIN_TARGET}${normalizedSearch}`,
    }
  }

  return {
    status: 'error',
    message: 'No authorization code was received. Initiate the OAuth flow from Orch Desktop.',
  }
}
