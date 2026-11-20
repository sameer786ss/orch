const START = Date.UTC(2025, 10, 10)
const DAY = 864e5
export const N = 364

export const level = (r: number) => (r >= 1e4 ? 4 : r >= 6e3 ? 3 : r >= 3e3 ? 2 : r >= 200 ? 1 : 0)
export const num = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ',')

const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const fmt = (k: number) => {
  const d = new Date(START + k * DAY)
  return `${D[d.getUTCDay()]} ${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const idx = (iso: string) => Math.round((Date.parse(iso) - START) / DAY)

export const EVENTS: Record<number, [kind: string, title: string, reads: number]> = {}

const raw: [string, string, string, number][] = [
  ['2025-12-04', 'Preprint', 'AST call-graph slicing vs raw token chunking', 6420],
  ['2026-01-20', 'Release', 'Orch Harness 0.1 internal lab runner', 4180],
  ['2026-02-12', 'Preprint', 'Quantized coding models: where type inference breaks first', 14810],
  ['2026-03-17', 'Research', 'Why agent benchmarks fail on multi-file rollback', 5902],
  ['2026-04-09', 'Preprint', 'Prompt cache eviction taxes in interactive coding', 8340],
  ['2026-05-21', 'Release', 'Orch OAuth local keychain bridge', 4910],
  ['2026-06-18', 'Preprint', 'Indirect prompt injection across workspace connectors', 9860],
  ['2026-08-06', 'Preprint', 'Firecracker micro-VM warm snapshots for git worktrees', 6950],
  ['2026-09-29', 'Postmortem', 'Measuring context rot across 60-file repositories', 16740],
  ['2026-10-11', 'Field note', 'Ephemeral micro-VMs for cloud coding sessions', 11180],
  ['2026-10-19', 'Release', 'Zero-trust agent connectors for GitHub, Drive, Gmail, Jira & Slack', 12640],
  ['2026-10-28', 'Field note', 'Low, Medium, High: allocating test-time compute across 340 PRs', 15310],
  ['2026-11-03', 'Research', 'The token deflation illusion: why API prices drop while bills double', 24890],
  ['2026-11-05', 'Release', 'Orch desktop release + $20/mo free compute for every user', 28410],
  ['2026-11-06', 'Research', 'Anatomy of a deterministic agentic harness past 40 steps', 19420],
]

raw.forEach(([d, k, t, r]) => (EVENTS[idx(d)] = [k, t, r]))

export const DEFAULT = idx('2026-11-05')

let a = 47
const rnd = () => {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const reads: number[] = Array.from({ length: N }, (_, k) =>
  EVENTS[k]?.[2] ?? (rnd() < 0.5 ? Math.floor(rnd() * 190) : Math.floor(200 + rnd() * 700))
)
