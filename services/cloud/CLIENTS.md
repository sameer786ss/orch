# Cloud session API for clients

All routes need `Authorization: Bearer <Firebase ID token>`, except `GET /models` and `GET /github/callback`.

Model catalogs are JSON arrays of `{id, name, provider, contextWindow, maxTokens, capabilities, badge, thinkingEfforts}`. Send the `id` as `model`.

Errors are JSON: `{error, code?}`. Status meanings:

- `401 INVALID_TOKEN`: the token is invalid or the account is disabled. Refresh the token.
- `503 AUTH_UNAVAILABLE`: token verification is temporarily down. Retry. Do not sign the user out.
- `403 GITHUB_RECONNECT_REQUIRED`: the linked GitHub account is missing or its token was revoked. Reconnect GitHub.
- `429 BUDGET_EXCEEDED`: the monthly budget is used up. Carries `cost_usd`, `limit_usd`, `period`, `resets_on`.
- `409 RUN_ACTIVE`: the session already has a run.
- `413`: request body or attachments too large.
- `502`/`504`: an upstream provider failed. Upstream auth failures are never returned as 401/403.

## Budget

Every user gets $20 per calendar month, resetting on the 1st (UTC). Usage is counted from input and output tokens with no cached-token discount. It covers cloud runs and `/vertex` only. `/title`, `/summarize`, compaction, `/tavily`, `/transcribe`, `/composio`, `/github`, and E2B sandboxes are free and not metered.

`GET /budget` returns `{costUsd, limitUsd, remaining, period, resetsOn, allowed}`.

## GitHub accounts & repositories

| Route | Purpose |
|---|---|
| `POST /github/connect` `{platform}` | Start native GitHub OAuth (`desktop` or `mobile`). Returns `{redirectUrl}`. |
| `GET /github/callback` | Public GitHub OAuth callback; stores encrypted token and redirects to `orch.live/oauth/github`. |
| `GET /github/accounts` | Connected GitHub accounts `[{id, login, name, avatarUrl, email, updatedAt}]`. |
| `DELETE /github/accounts/{id}` | Disconnect a GitHub account. |
| `GET /github/repos?accountId=&query=` | List/filter repositories across connected GitHub accounts. |

## Cloud projects & sessions

| Route | Purpose |
|---|---|
| `GET /cloud/projects` | Saved cloud projects `[{id, name, workspace, repoUrl, repoDir, githubAccountId, accountLogin, isPrivate, accountConnected, updatedAt}]`. |
| `POST /cloud/projects` `{repoUrl, accountId}` | Add/open an existing GitHub repository as a cloud project. |
| `POST /cloud/projects/create` `{accountId, name, description?, private}` | Create a new GitHub repository (`auto_init: true`) and open it as a cloud project. |
| `DELETE /cloud/projects/{id}` | Destroy the project's E2B sandbox, delete all its cloud sessions and GCS artifacts, and remove the project. |
| `GET /cloud/sessions?workspace=` | Sessions, newest first. Each has `running: true` while a run is active. |
| `GET /cloud/sessions/{id}/history?limit&before` | Saved `ChatEvent` entries, oldest first. `before` is a `seq` cursor. |
| `DELETE /cloud/sessions/{id}` | Stop the run and delete the session GCS prefix and Firestore entries. |
| `POST /cloud/chat/stream` | Send a message. Returns an SSE stream. |
| `GET /cloud/chat/resume?sessionId=&lastEventId=` | Rejoin a run. Returns an SSE stream. |
| `POST /cloud/chat/cancel` `{sessionId}` | Stop the run. Works from any device. |
| `GET /cloud/files/{list,tree,text,image,binary}?workspace=&path=` | Browse the sandbox. `list` takes `query` and `limit` (up to 2000). |
| `GET /cloud/terminal` | WebSocket PTY session into the sandbox. |

`POST /cloud/chat/stream` body: `{sessionId, prompt, model, workspace, repoUrl, attachments: [{name, dataBase64}], activeConnectors, thinkingEffort}`. Attachments may total 18 MB. Session ids are 1 to 64 characters of `A-Z a-z 0-9 - _`.

## Local proxies

| Route | Purpose |
|---|---|
| `GET /models` | Model catalog. No auth. |
| `POST /vertex/{version}/models/{model}:generateContent` | Model proxy through `v1internal`. `:streamGenerateContent` streams SSE. |
| `POST /tavily` | Web search. |
| `POST /transcribe` `{audio, format}` | Base64 audio to `{text}`. `format` is flac, m4a, mp3, mp4, mpeg, mpga, ogg, opus, wav or webm. |
| `POST /title` `{prompt}` | `{title}`. Uses `v1internal` (`gemini-3.5-flash-lite`), unmetered. |
| `POST /summarize` `{prompt, system?, maxTokens?}` | `{text}`. Uses `v1internal` (`gemini-3.5-flash-lite`), unmetered. |
| `GET /composio/catalog`, `GET /composio/accounts`, `POST /composio/connect`, `DELETE /composio/accounts/{id}`, `GET /composio/tools?toolkit=` or `?slugs=`, `POST /composio/execute` | Non-GitHub agent tool connectors. |

## Runs live on the server

A run keeps going if the client disconnects, closes, or is suspended. It stops only on `cancel`, session/project delete, a budget stop, an error, or an idle upstream (no data for 1800 s). Only one run per session: a second send gets `409 RUN_ACTIVE`. All sessions for the same project share one E2B sandbox.

## Stream events

SSE. Each block has `event: <type>` and a JSON `data:` matching tagged `ChatEvent` (`user`, `workStart`, `workStop`, `reasoningStart`, `reasoningDelta`, `reasoningStop`, `textDelta`, `textStop`, `toolStart`, `toolResult`, `toolCall`, `fileWritten`, `usage`, `notice`, `compacted`, `resync`, `cancelled`, `error`, `done`). Live events also carry `id: <n>`.

Lines starting with `:` are keep-alives.
