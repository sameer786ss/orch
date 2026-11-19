export type HandoffKind = 'signin' | 'connector'

export type HandoffState =
  | { status: 'working' }
  | { status: 'done'; target: string }
  | { status: 'error'; message: string; target?: string }

const CONNECTOR_TARGET = 'orch://oauth/composio'
const SIGNIN_TARGET = 'orch://auth-callback'

export function resolveHandoff(kind: HandoffKind, search: string): HandoffState {
  const normalizedSearch = search.startsWith('?') ? search : search ? `?${search}` : ''
  const params = new URLSearchParams(normalizedSearch)

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
    message: 'No authorisation code was received. Initiate the OAuth flow from Orch Desktop.',
  }
}
