# Cloud session API for clients

All routes need `Authorization: Bearer <Firebase ID token>`, except `GET /models`.

Model catalogs are JSON arrays of `{id, name, provider, contextWindow, maxTokens, capabilities, badge}`. Send the `id` as `model`.

Errors are JSON: `{error, code?}`. Status meanings:

- `401 INVALID_TOKEN`: the token is invalid or the account is disabled. Refresh the token.
- `503 AUTH_UNAVAILABLE`: token verification is temporarily down. Retry. Do not sign the user out.
- `429 BUDGET_EXCEEDED`: the monthly budget is used up. Carries `cost_usd`, `limit_usd`, `period`, `resets_on`.
- `409 RUN_ACTIVE`: the session already has a run.
- `413`: request body or attachments too large.
- `502`/`504`: an upstream provider failed. Upstream auth failures are never returned as 401/403.

## Budget

Every user gets $20 per calendar month, resetting on the 1st (UTC). Usage is counted from input and output tokens with no cached-token discount. It covers cloud runs and `/vertex` only. `/title`, `/summarize`, compaction, `/tavily`, `/transcribe`, `/composio`, and E2B sandboxes are free and not metered.

`GET /budget` returns `{costUsd, limitUsd, remaining, period, resetsOn, allowed}`.

## Cloud sessions

| Route | Purpose |
|---|---|
| `POST /cloud/workspace/init` `{repoUrl}` | Validate a repo. Returns `{workspace, repoUrl, repoDir}`. |
| `POST /cloud/chat/stream` | Send a message. Returns an SSE stream. |
| `GET /cloud/chat/resume?sessionId=&lastEventId=` | Rejoin a run. Returns an SSE stream. |
| `POST /cloud/chat/cancel` `{sessionId}` | Stop the run. Works from any device. |
| `GET /cloud/sessions?workspace=` | Sessions, newest first. Each has `running: true` while a run is active. |
| `GET /cloud/sessions/{id}/history?limit&before` | Saved `HistoryRecord` entries, oldest first. `before` is a `seq` cursor. |
| `GET /cloud/sessions/{id}/workspace` | `{workspace, repoUrl, repoDir}`. `404` if the session has no cloud workspace. |
| `DELETE /cloud/sessions/{id}` | Stop the run, delete the session GCS prefix and Firestore entries. |
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
| `GET /composio/accounts`, `POST /composio/connect`, `DELETE /composio/accounts/{id}`, `GET /composio/tools?slugs=`, `POST /composio/execute` | Connectors. |

## Runs live on the server

A run keeps going if the client disconnects, closes, or is suspended. It stops only on `cancel`, session delete, a budget stop, an error, or an idle upstream (no data for 1800 s). Only one run per session: a second send gets `409 RUN_ACTIVE`.

## Stream events

SSE. Each block has `event: <type>` and a JSON `data:` matching tagged `ChatEvent` (`workStart`, `workStop`, `reasoningStart`, `reasoningDelta`, `reasoningStop`, `textDelta`, `textStop`, `toolStart`, `toolResult`, `fileWritten`, `usage`, `notice`, `compacted`, `resync`, `cancelled`, `error`, `done`). Live events also carry `id: <n>`.

Lines starting with `:` are keep-alives.
