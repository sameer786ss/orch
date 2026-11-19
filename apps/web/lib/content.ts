import { BLOG_POSTS } from './blogs'

export const DOWNLOAD_LINKS = {
  macArm64: 'https://github.com/sameer786ss/orch/releases/latest/download/Orch-macOS-arm64.dmg',
  macX64: 'https://github.com/sameer786ss/orch/releases/latest/download/Orch-macOS-x64.dmg',
  windowsExe: 'https://github.com/sameer786ss/orch/releases/latest/download/Orch-Windows-Setup.exe',
} as const

export const CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    icon: '/connectors/github.svg',
    scope: 'Repos, PRs, Actions & Checks',
    summary: 'Inspect pull requests, checkout branches, read CI failure logs, and open verified diffs directly from the Orch harness.',
  },
  {
    id: 'drive',
    name: 'Google Drive',
    icon: '/connectors/drive.svg',
    scope: 'Docs, RFCs & Architecture Specs',
    summary: 'Ground agentic coding runs in your actual engineering RFCs, design docs, and spreadsheets with read-only OAuth scoping.',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '/connectors/gmail.svg',
    scope: 'Customer Bug Threads & Alerts',
    summary: 'Pull bug reports, stack traces, and production incident threads straight into your debugging context without copy-pasting.',
  },
  {
    id: 'jira',
    name: 'Jira',
    icon: '/connectors/jira.svg',
    scope: 'Issues, Epics & Acceptance Criteria',
    summary: 'Read ticket requirements, link branch commits to issue keys, and stage status transitions behind human approval gates.',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '/connectors/slack.svg',
    scope: 'Engineering Channels & Threads',
    summary: 'Summarize incident war-room threads into reproducible test cases and post release notes when verification passes.',
  },
] as const

export const THINKING_MODES = [
  {
    mode: 'Low Thinking',
    budget: '1,024 tokens',
    latency: '~1.4s response',
    bestFor: 'Fast single-file edits, UI tweaks, syntax fixes, terminal commands, and rapid iteration without burning your $20/mo credit.',
  },
  {
    mode: 'Medium Thinking',
    budget: '6,144 tokens',
    latency: '~3.8s response',
    bestFor: 'Multi-file feature implementation, wiring GitHub/Jira/Drive connector context, and standard API & test refactoring.',
  },
  {
    mode: 'High Thinking',
    budget: '24,576+ tokens',
    latency: 'Deep verification',
    bestFor: 'Hard concurrency bugs, multi-module architecture migrations, formal trace verification, and security-critical reviews.',
  },
] as const

export const kinds = {
  e: 'Research',
  f: 'Field note',
  p: 'Postmortem',
  r: 'Release',
} as const

export const JOURNAL_FILTERS = [
  ['all', `All (${BLOG_POSTS.length})`],
  ['e', 'Research'],
  ['f', 'Field notes'],
  ['p', 'Postmortems'],
  ['r', 'Releases'],
] as const

export const newest = [
  ['6 Nov', 'Preprint', BLOG_POSTS[0].title, 5, `/blog/${BLOG_POSTS[0].slug}`],
  ['5 Nov', 'Release', 'Orch desktop release: macOS (ARM64/x64) & Windows + $20/mo free compute', 5, '/orch-code'],
  ['3 Nov', 'Research', BLOG_POSTS[1].title, 5, `/blog/${BLOG_POSTS[1].slug}`],
  ['28 Oct', 'Field note', BLOG_POSTS[2].title, 4, `/blog/${BLOG_POSTS[2].slug}`],
] as const

export const papers = BLOG_POSTS.map(
  (b) => [b.id, b.status, b.title, b.heat, `/blog/${b.slug}`] as const
)

export const mostReadPosts = [...BLOG_POSTS]
  .sort((a, b) => Number(b.reads.replace(/,/g, '')) - Number(a.reads.replace(/,/g, '')))
  .slice(0, 4)
