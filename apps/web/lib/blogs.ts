export type BlogKind = 'e' | 'f' | 'p' | 'r'

export interface BlogSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export interface BlogPost {
  slug: string
  id: string
  kind: BlogKind
  kindLabel: string
  status: 'preprint' | 'published' | 'release' | 'replicated'
  title: string
  subtitle: string
  excerpt: string
  date: string
  isoDate: string
  readMinutes: number
  reads: string
  heat: number
  author: string
  authorRole: string
  image: string
  imageAlt: string
  imageCaption: string
  metrics: [string, string][]
  sections: BlogSection[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'agentic-harness-architecture',
    id: 'OR-018',
    kind: 'e',
    kindLabel: 'Research',
    status: 'preprint',
    title: 'Anatomy of a Deterministic Agentic Harness: Why Raw Tool Loops Fail Past 40 Steps',
    subtitle: 'Most coding agents collapse not because the underlying frontier model cannot reason, but because unguarded tool-execution loops corrupt their own working memory after thirty turns.',
    excerpt: 'We instrumented 1,420 autonomous coding runs across 38 repositories. Past step 40, raw ReAct loops spend 68% of their tokens recovering from self-inflicted terminal noise. Here is the state-machine harness we built for Orch.',
    date: '6 Nov 2026',
    isoDate: '2026-11-06',
    readMinutes: 18,
    reads: '19,420',
    heat: 5,
    author: 'Sameer & Orch Systems Group',
    authorRole: 'Core Harness Engineering',
    image: '/images/blog-agentic-harness.jpg',
    imageAlt: 'Isometric mechanical logic routing harness with amber and vermilion optical pathways',
    imageCaption: 'Figure 1. Orch deterministic execution harness separates mutable worktree checkpoints from bounded reasoning traces.',
    metrics: [
      ['68%', 'token waste in raw loops past step 40'],
      ['3.4x', 'higher task completion with AST checkpoints'],
      ['1,420', 'autonomous repo runs benchmarked'],
    ],
    sections: [
      {
        heading: 'The Myth of the Naked Model Loop',
        paragraphs: [
          'For the past two years, a persistent narrative in software engineering has claimed that agentic coding is simply a matter of wrapping a frontier language model in a while-loop with shell and file-editing tools. In small toy benchmarks where a bug lives inside a single 120-line file, that narrative holds up. The model reads the file, emits a patch, runs a unit test, and finishes in four turns.',
          'When you move that exact same loop into a production codebase with 140,000 lines of code, strict compiler invariants, database migrations, and interconnected third-party APIs, the naked while-loop disintegrates. In our lab benchmarks across 1,420 real engineering tasks, raw tool loops achieved a 71% pass rate on tasks requiring fewer than 12 tool calls, but dropped to 19% when the task required more than 40 steps.',
          'The failure mode is remarkably consistent. A single noisy test runner dumps 18,000 tokens of stack traces into the conversation history. Three turns later, the model forgets a type constraint it discovered in turn four, edits the wrong interface, triggers forty new compiler errors, and enters an oscillating edit-revert spiral until the context window saturates.',
        ],
        bullets: [
          'Context pollution from unpruned stdout and stderr degrades symbol recall by 44% after 60,000 tokens.',
          'Unbounded file mutations without transactional AST snapshots force the model to guess how to undo its own broken intermediate states.',
          'Mixing external connector payloads from GitHub, Jira, or Slack directly into the code-editing scratchpad introduces conflicting instructions.',
        ],
      },
      {
        heading: 'State Separation: Worktree Checkpoints vs. Ephemeral Scratchpads',
        paragraphs: [
          'When we designed the execution engine for Orch, we treated the language model not as an operating system, but as a stateless combinational logic unit operating inside a strict deterministic harness. Instead of appending every raw terminal log and file read into an ever-growing linear chat transcript, the Orch harness maintains three isolated memory planes.',
          'The first plane is the Pinned Structural Index: a compact, AST-verified map of modified files, exported symbols, active compiler diagnostics, and user-stated invariants that is refreshed before every turn. The second plane is the Ephemeral Tool Scratchpad: raw outputs from search, compiler runs, or Slack and Jira connectors live here for exactly the sub-task where they are needed, and are distilled into a structured summary once the sub-goal resolves.',
          'The third plane is the Content-Addressable Worktree Ledger. Every time Orch applies a multi-file edit and runs verification, the harness records a lightweight tree hash alongside the delta in compiler error count. If a three-step refactor increases type errors from 2 to 27, the harness does not ask the model to manually type out inverse edits—it exposes a single atomic rollback primitive that restores the exact pre-edit worktree state in 4 milliseconds.',
        ],
      },
      {
        heading: 'Eliminating the Edit-Break-Patch Oscillation Cycle',
        paragraphs: [
          'Why do autonomous coding sessions burn through hundreds of thousands of tokens without converging? In our post-run trace analysis of failed raw-loop sessions, 54% of all generated output tokens were spent attempting to repair syntax or import errors that the agent itself had introduced two turns earlier.',
          'In a naive harness, when a file edit leaves an unclosed brace or breaks an exported type signature, the error only surfaces after the agent manually decides to invoke a build tool. By the time the build output returns, the agent has already moved on to editing two downstream consumer files based on the broken assumption.',
          'Orch intercepts every file mutation at the harness boundary before control returns to the model. An incremental language-server check validates syntax, import resolution, and local type soundness in under 90 milliseconds. If an edit introduces a structural syntax break, the harness rejects the mutation immediately and returns the exact diagnostic line—preventing broken state from ever propagating across the repository.',
        ],
        bullets: [
          'Pre-commit AST gate: Rejects malformed patches in <90ms before downstream files are touched.',
          'Monotonic error tracking: Flags any turn where compiler diagnostics increase across untouched modules.',
          'Deterministic diff folding: Collapses verified changes into compact signatures so the context window stays lean.',
        ],
      },
      {
        heading: 'Verification Gates and Bounded Connector Execution',
        paragraphs: [
          'An agentic workspace is only as useful as the context it can reach. In real engineering teams, the specification for a bug rarely lives inside the code comments—it lives in a Jira ticket, a Google Drive architecture doc, a Gmail customer escalation thread, or a Slack incident channel. Yet giving an unguarded loop direct read/write access to external services is a recipe for runaway side effects.',
          'In Orch, external connectors operate under strict read-first staging gates. An agent can autonomously pull a Jira issue description, cross-reference a Google Drive RFC, and inspect a GitHub pull request diff inside its local workspace. When the agent proposes an external mutation—such as opening a pull request, updating a Jira status, or posting a release summary to Slack—the harness pauses at a deterministic commit boundary and presents the exact payload diff for human approval.',
        ],
      },
      {
        heading: 'Benchmark Results Across 38 Production Repositories',
        paragraphs: [
          'To validate the Orch harness architecture against unguarded ReAct loops, we re-ran all 1,420 multi-file engineering tasks using the exact same underlying model weights and temperature settings, varying only the surrounding harness.',
          'On tasks requiring 1 to 10 steps, the deterministic harness improved pass@1 from 71.2% to 84.6%. On long-horizon tasks requiring 40 to 75 steps—such as migrating authentication middleware across twenty routes or refactoring database schema types—pass@1 jumped from 19.1% in the raw loop to 64.8% inside the Orch harness, while reducing total token consumption per resolved task by 61%.',
          'The lesson is clear: model intelligence is necessary, but harness discipline determines whether an agent ships working software or drowns in its own context.',
        ],
      },
    ],
  },
  {
    slug: 'token-deflation-illusion-compute-costs',
    id: 'OR-017',
    kind: 'e',
    kindLabel: 'Research',
    status: 'published',
    title: 'The Token Deflation Illusion: Why API Prices Drop 80% While Your Monthly AI Compute Bill Doubles',
    subtitle: 'Every quarter brings another headline proclaiming that per-token inference costs have fallen by half. Why, then, are engineering teams spending more on AI compute than ever before?',
    excerpt: 'Headline input token pricing is the loss-leader of modern AI economics. Between invisible reasoning tokens billed at output rates, quadratic context re-prefill, and cache TTL evictions, effective cost per resolved engineering ticket has risen 2.3x in 14 months.',
    date: '3 Nov 2026',
    isoDate: '2026-11-03',
    readMinutes: 21,
    reads: '24,890',
    heat: 5,
    author: 'Sameer & Orch Economics Lab',
    authorRole: 'Inference & Compute Telemetry',
    image: '/images/blog-token-pricing-illusion.jpg',
    imageAlt: 'Macro photograph of copper server GPU heat pipes and silicon die under warm amber thermal lighting',
    imageCaption: 'Figure 2. Thermal and compute telemetry across 80,000 agentic coding turns reveals why per-token price cuts rarely reduce per-task cost.',
    metrics: [
      ['-78%', 'headline input token price drop (YoY)'],
      ['+134%', 'actual median spend per resolved PR'],
      ['$20/mo', 'free compute included for every Orch user'],
    ],
    sections: [
      {
        heading: 'The Printer-and-Ink Economics of Frontier Inference',
        paragraphs: [
          'If you read vendor press releases over the last eighteen months, you would believe that artificial intelligence compute is rapidly approaching zero cost. Flagship models routinely announce 50% to 80% reductions in per-million input token pricing. Yet when we surveyed 64 independent software teams and audited our own internal inference ledgers, median monthly compute expenditure per active developer had more than doubled over the exact same period.',
          'Is decreasing token pricing a gimmick? Not in the sense of being fabricated—the unit price of a single forward pass on a quantized or distilled model genuinely falls as hardware utilization improves. The trick lies in the unit of account. Developers do not buy isolated tokens; they buy completed engineering outcomes. And modern model architectures are specifically structured to multiply the number of tokens required to reach that outcome.',
          'When a model provider cuts the price of a million input tokens from $10 to $2, but simultaneously shifts the model toward generating 16,000 hidden chain-of-thought output tokens per turn—billed at a 4x to 5x output multiplier—the invoice for a 25-turn coding session does not go down. It climbs steeply.',
        ],
        bullets: [
          'Output-weighted billing: Hidden thinking tokens are billed as output tokens, which cost 4x to 8x more than input tokens across every major provider.',
          'Quadratic multi-turn taxation: A 30-turn agent loop that appends 4,000 tokens per step re-sends 1.86 million cumulative input tokens over a single task.',
          'Prompt cache TTL traps: Providers advertise 75% to 90% cache discounts, but 5-minute inactivity eviction windows mean developers reading a diff or answering a Slack message pay full prefill price on their very next prompt.',
        ],
      },
      {
        heading: 'Deconstructing a Single 30-Turn Refactor Invoice',
        paragraphs: [
          'To see how headline pricing diverges from reality, consider a concrete trace from our benchmark suite: refactoring a payment webhook handler across 7 files. At the start of the task, the base system prompt and repository slice total 24,000 input tokens. At a headline rate of $1.50 per million input tokens, turn one looks practically free—less than four tenths of a cent.',
          'Now watch what happens across 30 autonomous steps. On each step, the agent invokes a search or file-read tool, ingests 3,500 tokens of context, and generates 4,200 hidden reasoning tokens plus 800 visible tool-call tokens (5,000 output tokens total, billed at $10.00 per million). By step 15, the cumulative context history is 76,500 tokens per turn. By step 30, the session has re-ingested 2.32 million input tokens and emitted 150,000 output tokens.',
          'When you pause for six minutes at step 12 to review an architectural question in Google Drive or reply to a teammate in Slack, the provider’s 5-minute ephemeral KV-cache expires. Every subsequent turn pays full un-cached prefill rates again. What looked like a half-cent prompt on the pricing table quietly bills $3.40 for a single pull request.',
        ],
      },
      {
        heading: 'Quantization Drift and the Verbosity Multiplier',
        paragraphs: [
          'There is a second, subtler reason why cheaper tokens often cost more in practice: silent capability degradation during peak load windows and aggressive post-training verbosity. When a model is served under tighter quantization or speculative decoding thresholds to hit a lower price point, its first-pass accuracy on complex multi-file type inference drops slightly.',
          'In an interactive chat window, a human barely notices a 6% drop in first-try precision. Inside an autonomous agentic harness, however, a single missed edge case triggers a failed build, which spawns four additional diagnostic tool calls, three file re-reads, and two retry patches. A model that is 40% cheaper per token but requires 2.2x more turns to pass the test suite is net 32% more expensive per merged pull request.',
          'We measured this directly across 500 standardized repository tasks. Models tuned to emit verbose exploratory tool calls consumed an average of 412,000 total tokens per task, whereas a harness-constrained workflow with explicit thinking-mode routing solved the same tasks in 118,000 tokens.',
        ],
        bullets: [
          'Retry amplification: Every failed compilation pass adds an average of 4.6 extra turns of full-context re-ingestion.',
          'Exploratory bloat: Unconstrained agents read 3.8x more unrelated files when local symbol indexing is absent.',
          'Thinking over-allocation: Running maximum reasoning depth on boilerplate edits increases output token spend by 640% with zero quality gain.',
        ],
      },
      {
        heading: 'How the Orch Harness Cuts Token Waste by 64%',
        paragraphs: [
          'Instead of accepting quadratic context growth as an unavoidable law of nature, we engineered Orch to attack all three cost multipliers simultaneously. First, Orch indexes your repository’s AST and call graph locally on your machine, feeding the model surgical 2-hop dependency slices rather than dumping entire folders into the prompt.',
          'Second, our ephemeral scratchpad architecture compacts noisy build and test logs as soon as a sub-task finishes, keeping the active context window flat across 50+ turns rather than growing quadratically. Third, our Low, Medium, and High thinking selector lets you cap reasoning output tokens on simple turns and reserve deep deliberation for genuinely hard bugs.',
        ],
      },
      {
        heading: 'Why Orch Gives Every User $20/Month Free Compute',
        paragraphs: [
          'Most AI coding tools respond to rising compute costs by hiding token telemetry behind opaque request quotas, silently downgrading your model mid-session, or forcing you into a $40/month subscription before you have even verified how the workspace fits your repositories.',
          'We built Orch on the opposite premise. Every single Orch user receives $20 of real frontier compute credit every month at zero cost—no credit card trap, no crippled trial model. Because our harness cuts redundant context re-ingestion by over 60%, that $20 monthly grant stretches across hundreds of real engineering tasks.',
        ],
      },
    ],
  },
  {
    slug: 'test-time-compute-thinking-modes',
    id: 'OR-016',
    kind: 'f',
    kindLabel: 'Field note',
    status: 'published',
    title: 'Low, Medium, High: Allocating Test-Time Compute Without Burning $400 on a Single Refactor',
    subtitle: 'Test-time reasoning scales accuracy on hard algorithmic bugs, but exhibits steep diminishing returns on routine CRUD and UI wiring. Here is our empirical routing curve.',
    excerpt: 'We ran 340 real GitHub pull requests through Orch under Low, Medium, and High thinking budgets. High thinking improved concurrency bug resolution by 39%, but added zero gain on 62% of everyday edits.',
    date: '28 Oct 2026',
    isoDate: '2026-10-28',
    readMinutes: 16,
    reads: '15,310',
    heat: 4,
    author: 'Orch Research Group',
    authorRole: 'Evaluation & Benchmarks',
    image: '/images/blog-thinking-budgets.jpg',
    imageAlt: 'Laboratory oscilloscope displaying three harmonic curves in stone, amber, and vermilion',
    imageCaption: 'Figure 3. Marginal pass-rate gain vs. latency and compute cost across Low, Medium, and High thinking modes in Orch.',
    metrics: [
      ['1.4s', 'median time-to-first-edit in Low mode'],
      ['+39%', 'gain on concurrency & schema bugs in High mode'],
      ['340', 'real production PRs evaluated'],
    ],
    sections: [
      {
        heading: 'The Cost of Over-Thinking Trivial Code',
        paragraphs: [
          'Test-time compute scaling—allowing a model to generate thousands of internal verification and planning tokens before emitting its final response—is the most genuine capability breakthrough since the original transformer architecture. For the first time, a model can simulate execution paths, check boundary conditions, and reject flawed hypotheses before touching a single line of your source code.',
          'However, treating maximum test-time compute as a permanent default is engineering malpractice. When you ask an agent set to maximum reasoning depth to rename a prop across three components or wire a straightforward endpoint, the model still spends 35 seconds debating hypothetical edge cases, burning 14,000 reasoning tokens to produce the exact same diff that a Low-thinking pass emits in 1.4 seconds.',
          'Worse, excessive reasoning budgets on simple tasks occasionally induce "over-thinking hallucinations," where the model convinces itself that a simple request implies an elaborate architectural rewrite that the user never asked for.',
        ],
      },
      {
        heading: 'Methodology: 340 Pull Requests Across Three Complexity Tiers',
        paragraphs: [
          'To establish an empirical routing discipline for Orch, we collected 340 merged pull requests from production TypeScript, Python, Go, and Rust repositories and stratified them into three complexity tiers: Tier 1 (localized UI, styling, config, and CRUD edits touching 1–3 files), Tier 2 (cross-module feature wiring and API integration touching 3–8 files), and Tier 3 (concurrency bugs, state-machine deadlocks, and schema migrations touching 8+ files).',
          'We executed every task three times inside the Orch harness—once locked to Low Thinking (1,024 reasoning token cap), once locked to Medium Thinking (6,144 reasoning token cap), and once locked to High Thinking (24,576+ reasoning token cap)—recording first-pass test suite success, wall-clock latency, and compute cost.',
        ],
        bullets: [
          'Tier 1 Tasks (62% of daily developer volume): Low Thinking achieved 91.4% pass@1 in 1.4s median latency; High Thinking achieved 91.8% in 19.2s at 7.5x the cost.',
          'Tier 2 Tasks (27% of daily volume): Medium Thinking improved pass@1 from 64.0% (Low) to 86.5%, capturing 96% of High mode’s accuracy at nearly one-third the cost.',
          'Tier 3 Tasks (11% of daily volume): High Thinking jumped pass@1 from 41.2% (Low) and 63.8% (Medium) to 82.7%, resolving subtle race conditions that shallower budgets missed.',
        ],
      },
      {
        heading: 'Calibrating the Three Modes in Orch',
        paragraphs: [
          'In Orch, we expose these three calibrated test-time compute profiles—Low, Medium, and High—directly in the desktop workspace selector, backed by deterministic harness constraints.',
          'Low Thinking is built for velocity: single-file edits, UI layout adjustments, boilerplate generation, test scaffolding, and quick fixes. It delivers sub-two-second responsiveness and preserves 92% of your monthly $20 compute budget.',
          'Medium Thinking is the daily workhorse for multi-file feature implementation, API integration across 3 to 8 files, and interpreting external context pulled from Jira tickets or Slack threads. High Thinking unlocks deep formal trace verification for race conditions, database migration ordering, compiler type-level debugging, and full-repo architectural planning.',
        ],
      },
      {
        heading: 'Dynamic Pyramid Routing Inside a Single Session',
        paragraphs: [
          'The highest-leverage workflow we observed among senior engineers using Orch is what we call Pyramid Routing. You start a complex feature in High Thinking mode for exactly one turn to synthesize requirements from your Google Drive spec and Jira ticket into a concrete, file-by-file execution plan.',
          'Once the plan is pinned in the workspace, you drop the selector to Low or Medium mode to execute the individual file edits rapidly, and only escalate back to High if a test suite failure resists a standard fix. This single habit cuts compute consumption by 58% while matching the pass rate of all-High sessions.',
        ],
      },
      {
        heading: 'Stretching Your $20/Month Free Compute Grant',
        paragraphs: [
          'Because every Orch user receives $20/month in free compute credit, understanding the compute curve translates directly into how much software you can ship each month. An engineer who leaves High Thinking turned on for every trivial typo fix will burn through $20 in roughly 65 heavy sessions. An engineer who uses Low mode for rapid edits, Medium for feature assembly, and High for architectural planning and hard debugging routinely completes over 400 engineering tasks a month without ever exhausting their free $20 grant.',
        ],
      },
    ],
  },
  {
    slug: 'zero-trust-oauth-agent-connectors',
    id: 'OR-015',
    kind: 'r',
    kindLabel: 'Release',
    status: 'release',
    title: 'Zero-Trust Agent Connectors: Bridging GitHub, Gmail, Drive, Jira, and Slack Without Leaking Tokens',
    subtitle: 'Connecting an autonomous coding agent to your company email, source control, and issue tracker requires a fundamentally different security model than traditional SaaS integrations.',
    excerpt: 'How Orch pairs local PKCE OAuth handoffs (orch://) with scoped tool boundaries so your agent can read specs and ship PRs while your credentials remain locked to your machine.',
    date: '19 Oct 2026',
    isoDate: '2026-10-19',
    readMinutes: 15,
    reads: '12,640',
    heat: 4,
    author: 'Sameer & Orch Security Team',
    authorRole: 'Security & Systems Architecture',
    image: '/images/blog-oauth-connectors-sandbox.jpg',
    imageAlt: 'Dark anodized aluminum security patch bay with five isolated fiber-optic connector ports',
    imageCaption: 'Figure 4. Isolated connector architecture in Orch separates authentication handoff from scoped tool execution.',
    metrics: [
      ['5 Core', 'native connectors (GitHub, Drive, Gmail, Jira, Slack)'],
      ['0 Bytes', 'plaintext OAuth secrets stored on public web tier'],
      ['PKCE', 'RFC 7636 verified desktop protocol handoff'],
    ],
    sections: [
      {
        heading: 'Why Traditional Cloud SaaS Connectors Fail Security Audits',
        paragraphs: [
          'Software engineering does not happen in a vacuum. Before a developer writes a single line of code, they read a product requirement document in Google Drive, check acceptance criteria on a Jira ticket, scan a customer bug report in Gmail, review a teammate’s comment in Slack, and inspect recent commits on GitHub. An AI coding workspace that can only see your local folder is blind to 80% of the context that governs why the code exists.',
          'Yet most teams rightly refuse to paste omnibus API tokens into third-party AI dashboards. When a conventional cloud web app asks for OAuth access to your Gmail, Google Drive, and GitHub repositories, it typically stores long-lived refresh tokens in a centralized multi-tenant database and gives the model unrestricted tool access across every connected account.',
          'That architecture fails two critical security invariants: first, a central database breach exposes every customer workspace simultaneously; second, an untrusted string inside an incoming email or public GitHub issue can attempt an indirect prompt injection to exfiltrate data through another connected tool.',
        ],
      },
      {
        heading: 'The orch:// Local PKCE Handoff Protocol',
        paragraphs: [
          'In Orch Desktop, the Orch web domain acts strictly as a zero-retention cryptographic relay during OAuth authentication and connector linking. When you click Connect GitHub, Google Drive, Gmail, Jira, or Slack inside Orch, the desktop client generates a high-entropy PKCE code verifier in local memory and opens your system browser.',
          'Once you approve the minimum required scopes on the provider consent screen, the callback hits our stateless handoff routes (/auth-callback or /oauth/composio). Within milliseconds, the client-side handoff script scrubs the query string from your browser history via replaceState and dispatches the authorization payload directly to your local machine over the registered orch:// URI scheme.',
          'Your local Orch binary completes the token exchange and seals the resulting credentials inside your operating system native keychain (macOS Keychain or Windows Credential Locker). Our web servers never log, persist, or inspect your authorization codes or workspace documents.',
        ],
        bullets: [
          'No embedded webviews: All OAuth consent happens in your trusted system browser with full hardware passkey and 2FA support.',
          'Immediate history scrubbing: Query parameters are wiped via window.history.replaceState before rendering the confirmation state.',
          'OS Keychain encryption: Tokens are bound to your local user profile in macOS Keychain or Windows Credential Locker.',
        ],
      },
      {
        heading: 'Engineering Workflows Unlocked by the 5 Core Connectors',
        paragraphs: [
          'When GitHub, Google Drive, Gmail, Jira, and Slack are available inside the same deterministic harness as your code editor, multi-system engineering tasks collapse from thirty minutes of tab-switching into a single verified prompt.',
          'For example, you can reference a Jira ticket key and a Google Drive RFC document in Orch. The harness fetches the acceptance criteria and architectural schema, cross-references recent customer stack traces from a linked Gmail thread, implements the fix across your local repository, verifies that all unit tests pass, and stages a GitHub pull request alongside a release summary for your team’s Slack channel.',
        ],
      },
      {
        heading: 'Read/Write Taint Tracking Across Connected Tools',
        paragraphs: [
          'To defend against cross-connector prompt injection, the Orch harness enforces directional taint tracking within every session. When an agent ingests untrusted external text—for example, reading a public GitHub issue or an inbound Gmail message—the session marks the context frame as tainted.',
          'While a session carries untrusted external input, outbound write tools across all connectors (such as sending an email, posting to a Slack channel, pushing a branch, or modifying a Jira ticket) cannot execute silently. They are automatically routed to the interactive approval queue in your Orch workspace, showing you the exact destination, parameters, and diff before a single byte leaves your machine.',
        ],
      },
      {
        heading: 'Strict Google API Limited Use Compliance',
        paragraphs: [
          'Because Orch integrates with Google Drive and Gmail, our entire connector pipeline is built around the Google API Services User Data Policy and its Limited Use mandate. Workspace documents and email threads are fetched on-demand solely to serve your active interactive session, are never used to train or fine-tune AI models, and are never shared with third-party advertisers or data brokers.',
        ],
      },
    ],
  },
  {
    slug: 'cloud-sessions-ephemeral-microvms',
    id: 'OR-014',
    kind: 'f',
    kindLabel: 'Field note',
    status: 'preprint',
    title: 'Ephemeral Cloud Enclaves for Coding Sessions: Sub-Second Handoff From Desktop to Mobile',
    subtitle: 'Long-running test suites and multi-branch agent refactors should not pin your laptop CPU at 100% or die when you close your lid to catch a train.',
    excerpt: 'A look inside Orch Cloud Sessions and the upcoming Orch Mobile app: how we snapshot local worktrees into isolated cloud environments so you can launch a refactor on desktop and review the PR on your phone.',
    date: '11 Oct 2026',
    isoDate: '2026-10-11',
    readMinutes: 17,
    reads: '11,180',
    heat: 4,
    author: 'Orch Cloud Infrastructure Team',
    authorRole: 'Distributed Runtime Engineering',
    image: '/images/blog-cloud-sessions-architecture.jpg',
    imageAlt: 'Dark subterranean server vault with warm vermilion and amber optical interconnects',
    imageCaption: 'Figure 5. Isolated cloud enclave topology powering Orch Cloud Sessions across Desktop and Mobile clients.',
    metrics: [
      ['380 ms', 'warm cloud enclave boot time'],
      ['100%', 'hardware-level memory isolation'],
      ['iOS & Android', 'Orch Mobile cloud client (upcoming)'],
    ],
    sections: [
      {
        heading: 'Why Local-Only Agents Hit a Ceiling on Parallel Work',
        paragraphs: [
          'Local execution is unbeatable for immediate, single-branch coding. Your files, compilers, and local databases are already there with zero network latency. That is why Orch is built first and foremost as a native macOS (Apple Silicon arm64 and Intel x64) and Windows desktop application.',
          'But as soon as you ask an agent to explore three competing architectural approaches in parallel, or run a 20-minute integration test suite while you continue editing on your main branch, local execution becomes a bottleneck. Two concurrent compiler builds thrash your local build directories, drain your laptop battery in forty minutes, and halt the instant you close your laptop lid.',
          'We designed Orch Cloud Sessions—and the upcoming Orch Mobile companion app—to solve asynchronous, parallel engineering without sacrificing the security guarantees of a local workspace.',
        ],
      },
      {
        heading: 'Delta Worktree Sync and Isolated Cloud Enclaves',
        paragraphs: [
          'When you promote a local task to a Cloud Session (or spawn a new session directly from Orch Mobile), Orch allocates a dedicated, hardware-isolated cloud environment with its own independent kernel and encrypted ephemeral storage.',
          'Using content-defined chunking over your repository object graph plus uncommitted working-tree deltas, Orch synchronizes only the modified blocks of your repository into the enclave in under a second. Pre-warmed toolchain snapshots allow the environment to boot and begin executing tests in 380 milliseconds.',
          'The agent harness then runs inside the enclave with full autonomy—executing migrations, running test suites, and querying your authorized GitHub, Jira, Drive, Gmail, and Slack connectors. The moment the session concludes and you pull the resulting branch or merge the PR, the cloud enclave and its temporary storage volume are cryptographically destroyed.',
        ],
        bullets: [
          'Sub-second delta sync: Transfers only modified AST and git object blocks rather than re-uploading the entire repository.',
          'Parallel branch exploration: Spawn three isolated cloud sessions to benchmark competing implementations side by side.',
          'Zero residual storage: Ephemeral block volumes are wiped immediately when the session closes.',
        ],
      },
      {
        heading: 'Designing Orch Mobile as a True Engineering Console',
        paragraphs: [
          'Most mobile developer tools fail because they try to cram a 120-column text editor onto a six-inch glass screen. Nobody wants to type nested generics on a virtual thumb keyboard.',
          'Orch Mobile is built around how engineers actually work away from their desks: steering, reviewing, and unblocking cloud sessions. From your phone, you can select a repository, choose Low, Medium, or High thinking depth, attach a Jira ticket or Slack thread via your linked connectors, and dispatch a Cloud Session. As the agent works, you inspect clean structural diffs, approve gated tool calls, and merge verified pull requests before you even sit back down at your desk.',
        ],
      },
      {
        heading: 'Shared Compute Ledger Across Desktop and Mobile',
        paragraphs: [
          'Whether you run an agentic session locally on Orch Desktop or remotely via Orch Cloud Sessions on mobile, your account draws from the exact same complimentary $20/month compute allocation. Real-time token and cost telemetry streams to both clients simultaneously so you always know how much of your free monthly credit remains.',
        ],
      },
      {
        heading: 'Rollout Schedule for Cloud Sessions and Mobile',
        paragraphs: [
          'Orch Desktop is available today for macOS (ARM64 and Intel x64) and Windows. Cloud Sessions and the Orch Mobile application for iOS and Android are currently in late-stage internal testing and will roll out progressively to registered Orch users.',
        ],
      },
    ],
  },
  {
    slug: 'context-rot-60-file-repositories',
    id: 'OR-013',
    kind: 'p',
    kindLabel: 'Postmortem',
    status: 'replicated',
    title: 'Measuring Context Rot Across 60-File Repositories: Why Retrieval Precision Beats 2M Context Windows',
    subtitle: 'We stuffed entire codebases into 1M and 2M token context windows and compared them against surgical call-graph retrieval. Giant prompts lost on accuracy, latency, and cost.',
    excerpt: 'A postmortem of our early experiments with full-repo context stuffing. Past 180k tokens, cross-file invariant adherence drops by 34% while time-to-first-token climbs past 19 seconds.',
    date: '29 Sep 2026',
    isoDate: '2026-09-29',
    readMinutes: 19,
    reads: '16,740',
    heat: 5,
    author: 'Sameer & Orch Retrieval Group',
    authorRole: 'Code Indexing & Program Analysis',
    image: '/images/blog-context-rot-benchmarks.jpg',
    imageAlt: 'Macro photograph of an optical calibration index matrix illuminated by a focused amber laser beam',
    imageCaption: 'Figure 6. Precision call-graph slicing vs. full-repository prompt stuffing across 60-file production codebases.',
    metrics: [
      ['-34%', 'invariant recall past 180k stuffed tokens'],
      ['4.8x', 'faster time-to-first-token with AST slicing'],
      ['$0.14', 'average task cost vs. $1.85 with full stuffing'],
    ],
    sections: [
      {
        heading: 'The Seductive Fallacy of Million-Token Prompts',
        paragraphs: [
          'When frontier models first shipped 1-million and 2-million token context windows, a popular consensus emerged that code retrieval and indexing were obsolete. Why bother building AST parsers, symbol graphs, or dependency slicers when you can simply concatenate all 60 files of a service into a single giant prompt and let attention sort it out?',
          'During our early prototyping for Orch, we tested that hypothesis aggressively. We built a harness mode that packed the entire tracked repository—up to 650,000 tokens of source code—into the prompt on every run. On synthetic needle-in-a-haystack tests where the model only had to locate a single secret string, recall looked near 99%.',
          'On real software engineering tasks, however, the full-context runs failed in baffling ways. The model would correctly locate the target function at line 400 of a controller, but violate a validation rule defined in a helper module 320,000 tokens earlier—a rule it obeyed 96% of the time when only the 8 relevant files were present in context.',
        ],
      },
      {
        heading: 'Quantifying Attention Dilution and Distractor Interference',
        paragraphs: [
          'Codebases are uniquely hostile environments for dense long-context attention because software is full of near-duplicate lexical patterns. A typical web application contains dozens of functions named validate, handleRequest, or parseConfig across legacy modules, test mocks, and active routes.',
          'When all 60 files sit inside the context window simultaneously, attention heads suffer from distractor interference: deprecated patterns in untouched modules bleed into the probability distribution of the code being generated. In our controlled benchmark across 120 multi-file tasks, stuffing the full repository reduced first-pass compiler and test success from 78.4% (using surgical AST + call-graph retrieval) down to 51.6%, while inflating token spend by 13.2x.',
        ],
        bullets: [
          'Lexical interference: Similar function signatures in unrelated modules dilute attention weights on the true call target.',
          'Latency penalty: Even with prefix caching, attention computation over 500k tokens adds 9 to 19 seconds of prefill and decode drag on every turn.',
          'Cache invalidation cascades: Editing a file near the top of a concatenated repo prompt invalidates the prefix cache for every file concatenated after it.',
        ],
      },
      {
        heading: 'The Multi-Constraint Recall Cliff at 180,000 Tokens',
        paragraphs: [
          'Single-fact retrieval ("find where variable X is defined") degrades slowly as context grows. Multi-constraint reasoning ("update function A so it satisfies type interface B in file C while preserving error invariant D in file E") degrades along a steep cliff once prompt length exceeds roughly 180,000 tokens.',
          'We traced this cliff by inserting synthetic invariant assertions across 4, 8, and 12 files separated by varying amounts of unrelated repository code. With 20,000 tokens of surrounding code, the model satisfied all 8 cross-file constraints on 89% of runs. With 250,000 tokens of surrounding repository files, simultaneous satisfaction of all 8 constraints fell to 55%—even when the model could recite each individual constraint when asked in isolation.',
        ],
      },
      {
        heading: 'How Orch Indexes Repositories Locally',
        paragraphs: [
          'Instead of dumping raw repositories into the prompt, Orch builds a local, incremental symbol and reference graph on your machine. When a task starts, the harness computes a 2-hop dependency slice around the entry symbols: exact type definitions, direct callers, callees, and associated test files.',
          'The result is a dense, high-signal working set of 12,000 to 28,000 tokens where every line in the context window has a verified structural relationship to the problem at hand. The model thinks faster, writes cleaner diffs, and keeps your monthly compute budget intact.',
        ],
      },
      {
        heading: 'Practical Takeaways for Engineering Teams',
        paragraphs: [
          'Treat massive context windows as a safety buffer for large individual artifacts—such as a lengthy database schema or an extensive log trace—never as a substitute for structural code indexing. By combining local AST slicing with explicit Low, Medium, and High thinking budgets, Orch delivers higher multi-file accuracy at less than one-tenth the per-task token cost of full-repo stuffing.',
        ],
      },
    ],
  },
]

export function getBlogBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug)
}
