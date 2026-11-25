import { invoke, Channel } from "@tauri-apps/api/core";

export type Role = "user" | "assistant" | "system";

export type ToolStatus = "running" | "done" | "error";

export interface UserAttachment {
  name: string;
  path?: string | null;
  dataUrl?: string | null;
  isImage?: boolean;
}

export type MessageItem =
  | {
      type: "work";
      id: string;
      active: boolean;
      durationSeconds?: number;
      stopped?: boolean;
    }
  | {
      type: "reasoning";
      id: string;
      text: string;
      active: boolean;
      durationSeconds?: number;
      startTime?: number;
    }
  | {
      type: "toolCall";
      id: string;
      callId?: string;
      name: string;
      arguments?: Record<string, unknown>;
      args?: string;
      displayInfo: ToolDisplayInfo;
      output?: string;
      status: ToolStatus;
    }
  | {
      type: "text";
      id: string;
      text: string;
      active?: boolean;
    }
  | {
      type: "compactionNotice";
      id: string;
      originalMessageCount: number;
      ts: number;
    };

export interface ChatMessage {
  id: string;
  role: Role;
  text?: string;
  items: MessageItem[];
  attachments: UserAttachment[];
  streaming: boolean;
  error?: string;
  notice?: string;
}

export interface ModelDto {
  key: string;
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxTokens: number;
  capabilities: string[];
  badge?: string | null;
  thinkingEfforts: string[];
}

export interface Budget {
  costUsd: number;
  limitUsd: number;
  remaining: number;
  period: string;
  allowed: boolean;
}

export interface SessionSummary {
  id: string;
  title?: string | null;
  workspacePath?: string | null;
  updatedAt: number;
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  running?: boolean;
}

export type ToolIcon =
  | "file"
  | "folder"
  | "terminal"
  | "search"
  | "globe"
  | "book"
  | "cpu"
  | "zapOff";

export interface ToolDisplayInfo {
  label: string;
  activeLabel: string;
  filename?: string | null;
  fullPath?: string | null;
  lineRange?: string | null;
  addedLines?: number | null;
  removedLines?: number | null;
  targetText?: string | null;
  icon: ToolIcon;
  opensArtifact: boolean;
  connector?: string | null;
}

export interface UserDisplay {
  id: string;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  initial: string;
}

export interface FileEntry {
  path: string;
  name: string;
}

export interface TreeEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface DirListing {
  entries: TreeEntry[];
  truncated: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  truncated: boolean;
}

export interface AttachmentRef {
  path: string;
  name: string;
  isImage: boolean;
}

export interface TurnUsage {
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

export type HistoryUserPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data?: string; uri?: string }
  | { type: "document"; name: string; path?: string };

export type ChatEvent =
  | { type: "user"; content: HistoryUserPart[] }
  | { type: "workStart" }
  | { type: "workStop"; durationSeconds: number; stopped: boolean }
  | { type: "reasoningStart" }
  | { type: "reasoningDelta"; text: string }
  | { type: "reasoningStop"; durationSeconds: number; text?: string }
  | { type: "textDelta"; text: string }
  | { type: "textStop"; text?: string }
  | {
      type: "toolStart";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      display: ToolDisplayInfo;
    }
  | { type: "toolResult"; callId: string; isError: boolean; output: string }
  | {
      type: "toolCall";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      display: ToolDisplayInfo;
      output?: string;
      isError?: boolean;
    }
  | { type: "fileWritten"; path: string }
  | ({ type: "usage" } & TurnUsage)
  | { type: "notice"; message: string }
  | {
      type: "compacted";
      id: string;
      originalMessageCount: number;
      ts: number;
      contextTokens: number;
    }
  | { type: "resync" }
  | { type: "cancelled" }
  | { type: "error"; message: string; code?: string }
  | { type: "done" };

export type ChatStreamEvent = ChatEvent;

export type SessionRecord = { seq: number } & ChatEvent;

export interface SessionRecordPage {
  records: SessionRecord[];
  hasMore: boolean;
  earliestSeq: number | null;
}

export interface GithubAccountDto {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
  email: string;
  updatedAt: number;
}

export interface CloudProjectDto {
  id: string;
  name: string;
  workspace: string;
  repoUrl: string;
  repoDir: string;
  githubAccountId: string;
  accountLogin: string;
  isPrivate: boolean;
  accountConnected: boolean;
  updatedAt: number;
}

type DictationEvent =
  | { type: "final"; text: string }
  | { type: "error"; message: string };

type TerminalEvent = { type: "data"; data: string } | { type: "exit" };

export type HistoryAction = "back" | "forward" | "reload" | "stop";

export function getAuthUser(): Promise<UserDisplay | null> {
  return invoke("get_auth_user");
}

export function getOAuthUrl(redirectTo?: string): Promise<string> {
  return invoke("get_oauth_url", redirectTo ? { redirectTo } : {});
}

export function signOutAuth(): Promise<void> {
  return invoke("sign_out_auth");
}

export function setWorkspace(path: string): Promise<string> {
  return invoke("set_workspace", { path });
}

export function createLocalWorkspace(
  parentDir: string,
  folderName: string,
  initGit: boolean
): Promise<string> {
  return invoke("create_local_workspace", { parentDir, folderName, initGit });
}

export function activateCloudProject(project: CloudProjectDto): Promise<void> {
  return invoke("activate_cloud_project", { project });
}

export function listCloudProjects(): Promise<CloudProjectDto[]> {
  return invoke("list_cloud_projects");
}

export function openCloudProject(repoUrl: string, accountId: string): Promise<CloudProjectDto> {
  return invoke("open_cloud_project", { repoUrl, accountId });
}

export function createCloudProject(
  accountId: string,
  name: string,
  description: string | null,
  privateRepo: boolean
): Promise<CloudProjectDto> {
  return invoke("create_cloud_project", {
    accountId,
    name,
    description,
    private: privateRepo,
  });
}

export function deleteCloudProject(projectId: string, workspaceUri: string): Promise<void> {
  return invoke("delete_cloud_project", { projectId, workspaceUri });
}

export function deleteLocalWorkspace(workspacePath: string): Promise<void> {
  return invoke("delete_local_workspace", { workspacePath });
}

export function listSessionsForWorkspace(workspacePath: string): Promise<SessionSummary[]> {
  return invoke("list_sessions_for_workspace", { workspacePath });
}

export function listModels(forceRefresh?: boolean): Promise<ModelDto[]> {
  return invoke("list_models", { forceRefresh });
}

export function getBudget(): Promise<Budget> {
  return invoke("get_budget");
}

export function getSessionRecords(
  sessionId: string,
  limit?: number,
  beforeSeq?: number | null
): Promise<SessionRecordPage> {
  return invoke("get_session_records", {
    sessionId,
    limit: limit ?? 50,
    beforeSeq: beforeSeq ?? null,
  });
}

export function clearSession(sessionId: string): Promise<void> {
  return invoke("clear_session", { sessionId });
}

export function getUserPref(key: string, scoped = false): Promise<string | null> {
  return invoke("get_user_pref", { key, scoped });
}

export function setUserPref(key: string, value: string, scoped = false): Promise<void> {
  return invoke("set_user_pref", { key, value, scoped });
}

export function startChat(
  sessionId: string,
  model: string,
  prompt: string,
  attachments: AttachmentRef[],
  activeConnectors: string[],
  thinkingEffort: string,
  onEvent: (evt: ChatStreamEvent) => void
): Promise<void> {
  const channel = new Channel<ChatStreamEvent>();
  channel.onmessage = onEvent;
  return invoke("start_chat", {
    sessionId,
    model,
    prompt,
    attachments,
    activeConnectors,
    thinkingEffort,
    onEvent: channel,
  });
}

export function resumeChat(
  sessionId: string,
  onEvent: (evt: ChatStreamEvent) => void
): Promise<void> {
  const channel = new Channel<ChatStreamEvent>();
  channel.onmessage = onEvent;
  return invoke("resume_chat", { sessionId, onEvent: channel });
}

export function cancelChat(sessionId: string): Promise<void> {
  return invoke("cancel_chat", { sessionId });
}

export function listWorkspaceFiles(query: string, limit = 100): Promise<FileEntry[]> {
  return invoke("list_workspace_files", { query, limit });
}

export function listWorkspaceDir(path = ""): Promise<DirListing> {
  return invoke("list_workspace_dir", { path });
}

export function readTextFile(path: string): Promise<FileContent> {
  return invoke("read_text_file", { path });
}

export function readImageDataUrl(path: string): Promise<string> {
  return invoke("read_image_data_url", { path });
}

export function readBinaryFile(path: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_binary_file", { path });
}

export function startDictation(onEvent: (evt: DictationEvent) => void): Promise<void> {
  const channel = new Channel<DictationEvent>();
  channel.onmessage = onEvent;
  return invoke("start_dictation", { onEvent: channel });
}

export function stopDictation(): Promise<void> {
  return invoke("stop_dictation");
}

export function terminalOpen(
  id: string,
  cols: number,
  rows: number,
  onEvent: (evt: TerminalEvent) => void
): Promise<void> {
  const channel = new Channel<TerminalEvent>();
  channel.onmessage = onEvent;
  return invoke("terminal_open", { id, cols, rows, onEvent: channel });
}

export function terminalWrite(id: string, data: string): Promise<void> {
  return invoke("terminal_write", { id, data });
}

export function terminalResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("terminal_resize", { id, cols, rows });
}

export function terminalClose(id: string): Promise<void> {
  return invoke("terminal_close", { id });
}

export function webviewNavigate(label: string, url: string): Promise<void> {
  return invoke("webview_navigate", { label, url });
}

export function webviewHistory(label: string, action: HistoryAction): Promise<void> {
  return invoke("webview_history", { label, action });
}

export function webviewClose(label: string): Promise<void> {
  return invoke("webview_close", { label });
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function formatRelativeTime(ts?: number): string {
  if (!ts) return "now";
  const sec = Math.abs(Math.round((Date.now() - ts) / 1000));
  if (sec < 45) return "now";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  if (sec < 604800) return `${Math.round(sec / 86400)}d`;
  if (sec < 2592000) return `${Math.round(sec / 604800)}w`;
  if (sec < 31536000) return `${Math.round(sec / 2592000)}mo`;
  return `${Math.round(sec / 31536000)}y`;
}

export interface ConnectorDto {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string | null;
  connected: boolean;
  toolCount: number;
}

export function listConnectors(): Promise<ConnectorDto[]> {
  return invoke("list_connectors");
}

export interface GithubRepoDto {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  description: string;
  private: boolean;
  url: string;
  updatedAt: string;
  accountId: string;
  accountLogin: string;
}

export function listGithubAccounts(): Promise<GithubAccountDto[]> {
  return invoke("list_github_accounts");
}

export function getGithubConnectUrl(): Promise<string> {
  return invoke("get_github_connect_url");
}

export function disconnectGithubAccount(accountId: string): Promise<void> {
  return invoke("disconnect_github_account", { accountId });
}

export function listGithubRepos(accountId: string | null, query: string): Promise<GithubRepoDto[]> {
  return invoke("list_github_repos", { accountId, query });
}

export function getConnectorAuthUrl(connectorId: string): Promise<string> {
  return invoke("get_connector_auth_url", { connectorId });
}

export function disconnectConnector(connectorId: string): Promise<void> {
  return invoke("disconnect_connector", { connectorId });
}

export type DocumentArtifactKind = "pdf" | "docx" | "xlsx" | "pptx";

export function reportError(message: string): Promise<void> {
  return invoke("report_error", { message });
}
