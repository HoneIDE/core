# hone-core — Project Plan

## 1. Overview

**What:** `@honeide/core` is the service backbone of Hone. It provides workspace management, file operations, search, git integration, settings, protocol clients (LSP, DAP, formatter), the complete AI system (provider abstraction, inline completion, chat, agent mode, PR review), and the extension host.

**Why:** By decoupling IDE services from the UI layer, `hone-core` can power headless tools, CLI integrations, alternative UIs, and testing harnesses. The AI system lives here so any frontend (desktop, mobile, web) can use it.

**Who uses it:**
- `hone-ide` — the full IDE consumes all services
- CLI tools — headless linting, AI review, workspace search
- Test harnesses — integration tests run services without UI

**Role in ecosystem:** Layer 2 — depends on `@honeide/api` (types), `@honeide/editor` (buffer/diff for AI edits), and `@honeide/terminal` (for agent terminal tool). This is the most complex package.

---

## 2. Dependencies

### Internal
- `@honeide/api` — Extension API types (this package *implements* them)
- `@honeide/editor` — EditorDocument, TextBuffer, DiffEngine (used by AI agent for edits)
- `@honeide/terminal` — TerminalEmulator (used by agent terminal tool)

### External
- None beyond Perry built-ins (`fs`, `path`, `child_process`, `net`, `crypto`)
- HTTP client for AI provider APIs (Perry's native `fetch` or `net` module)

### Perry Built-ins Used
- `fs` — file read/write, watching
- `path` — cross-platform path handling
- `child_process` — spawn LSP/DAP servers, ripgrep, git, formatters
- `net` — TCP connections for some LSP transports
- `crypto` — hashing for caching, token generation
- `perry/system` — keychain (for secure API key storage)

---

## 3. Repository Structure

```
hone-core/
├── workspace/
│   ├── workspace.ts                # Multi-root workspace management
│   ├── file-watcher.ts             # Native file system watching (Perry fs.watch)
│   └── file-index.ts               # Fuzzy file finder (in-memory index)
│
├── search/
│   ├── ripgrep.ts                  # Ripgrep integration via child_process
│   └── search-model.ts            # Search result types and aggregation
│
├── git/
│   ├── git-client.ts              # Shell-based git operations
│   ├── blame.ts                   # Git blame parsing
│   ├── diff.ts                    # Git diff parsing (unified diff → structured hunks)
│   ├── status.ts                  # Git status parsing
│   ├── log.ts                     # Git log parsing
│   └── platform/                  # Remote platform integrations
│       ├── github.ts              # GitHub REST API (PRs, issues, reviews, checks)
│       ├── gitlab.ts              # GitLab REST API (MRs, issues, pipelines)
│       └── bitbucket.ts           # Bitbucket REST API (PRs)
│
├── tasks/
│   ├── task-runner.ts             # Task execution (build, test, custom commands)
│   └── task-config.ts             # tasks.json schema and parsing
│
├── settings/
│   ├── settings-store.ts          # Layered: default → user → workspace → language
│   ├── keybindings.ts             # Keybinding resolution (key chord → command)
│   └── schema.ts                  # Settings JSON schema + validation
│
├── protocols/
│   ├── lsp/
│   │   ├── lsp-manager.ts         # Server lifecycle (start/stop per language)
│   │   ├── lsp-client.ts          # Full LSP 3.17 JSON-RPC client
│   │   └── capabilities.ts        # Capability negotiation + feature detection
│   ├── dap/
│   │   ├── dap-manager.ts         # Debug adapter lifecycle
│   │   └── dap-client.ts          # Debug Adapter Protocol client
│   └── formatter/
│       └── formatter.ts           # stdin→stdout external formatter integration
│
├── ai/
│   ├── provider/
│   │   ├── ai-protocol.ts         # AIProviderAdapter interface (mirrors @honeide/api)
│   │   ├── provider-registry.ts   # Register + manage multiple providers
│   │   ├── model-router.ts        # Route features to configured providers/models
│   │   ├── token-counter.ts       # Estimate token counts per provider
│   │   └── adapters/
│   │       ├── anthropic.ts       # Claude — Messages API with streaming
│   │       ├── openai.ts          # GPT / o-series — Chat Completions API
│   │       ├── google.ts          # Gemini — Generative Language API
│   │       ├── ollama.ts          # Ollama — local models via REST
│   │       ├── openai-compat.ts   # Any OpenAI-compatible endpoint
│   │       ├── bedrock.ts         # AWS Bedrock — SigV4 auth + streaming
│   │       ├── vertex.ts          # Google Cloud Vertex AI — OAuth + streaming
│   │       └── azure-openai.ts    # Azure OpenAI — Azure AD auth
│   │
│   ├── inline/
│   │   ├── completion-provider.ts # Request + render ghost text completions
│   │   ├── fim-adapter.ts         # Fill-in-the-middle formatting per provider
│   │   ├── debouncer.ts           # Intelligent request debouncing
│   │   └── cache.ts               # LRU cache for recent completions
│   │
│   ├── chat/
│   │   ├── chat-model.ts          # Chat history, message management
│   │   ├── context-collector.ts   # Auto-collect: open files, errors, terminal, git diff
│   │   ├── streaming-renderer.ts  # Streaming markdown response accumulation
│   │   └── code-actions.ts        # "Explain", "Refactor", "Fix", "Test" from selection
│   │
│   ├── agent/
│   │   ├── orchestrator.ts        # Plan + execute multi-step autonomous tasks
│   │   ├── planner.ts             # Decompose user intent into action steps
│   │   ├── tools.ts               # Tool definitions (AgentToolDefinition[])
│   │   ├── tool-impls/
│   │   │   ├── file-read.ts       # Read file contents
│   │   │   ├── file-edit.ts       # Edit files (patch-based via hone-editor)
│   │   │   ├── file-create.ts     # Create new files
│   │   │   ├── file-delete.ts     # Delete files (with confirmation)
│   │   │   ├── file-rename.ts     # Rename/move files
│   │   │   ├── terminal-run.ts    # Run shell commands (via hone-terminal)
│   │   │   ├── terminal-read.ts   # Read recent terminal output
│   │   │   ├── git-ops.ts         # Git operations (diff, stage, commit, branch)
│   │   │   ├── search.ts          # Workspace file/content search
│   │   │   ├── lsp-query.ts       # LSP queries (definitions, references, diagnostics)
│   │   │   ├── web-fetch.ts       # Fetch URLs (documentation, APIs)
│   │   │   ├── user-ask.ts        # Prompt user for input/clarification
│   │   │   └── user-show-diff.ts  # Show proposed changes for approval
│   │   ├── approval-flow.ts       # Per-hunk accept/reject UI coordination
│   │   ├── context-builder.ts     # Build rich context from editor state
│   │   ├── error-recovery.ts      # Auto-retry on build/test failures
│   │   └── activity-log.ts        # Track all agent actions for transparency
│   │
│   └── review/
│       ├── review-engine.ts       # Orchestrates AI-powered code review
│       ├── diff-chunker.ts        # Split diff into AI-digestible chunks
│       ├── annotation-parser.ts   # Parse AI response → ReviewAnnotation[]
│       ├── review-submitter.ts    # Submit review to GitHub/GitLab/Bitbucket
│       └── review-types.ts        # ReviewAnnotation, ReviewSeverity, etc.
│
├── extensions/
│   ├── extension-host.ts          # Extension lifecycle management
│   ├── extension-api-impl.ts      # Bridge: @honeide/api contracts → core services
│   ├── manifest.ts                # hone-extension.json parsing + validation
│   └── registry.ts                # Extension discovery and registration
│
├── index.ts                       # Public API barrel export
│
├── tests/
│   ├── workspace/
│   ├── git/
│   ├── settings/
│   ├── lsp/
│   ├── ai/
│   │   ├── provider/
│   │   ├── inline/
│   │   ├── chat/
│   │   ├── agent/
│   │   └── review/
│   └── extensions/
│
├── perry.config.ts
├── package.json                   # Published as @honeide/core
├── CHANGELOG.md
└── LICENSE                        # MIT
```

---

## 4. Core Interfaces & Types

### Workspace

```typescript
/** Multi-root workspace management */
interface WorkspaceService {
  /** Currently open workspace folders */
  readonly folders: readonly WorkspaceFolder[];

  /** Open a workspace from a folder path or .hone-workspace file */
  open(pathOrWorkspaceFile: string): Promise<void>;

  /** Add a folder to the workspace */
  addFolder(folderPath: string): void;

  /** Remove a folder from the workspace */
  removeFolder(folderPath: string): void;

  /** Read a file from any workspace folder */
  readFile(uri: string): Promise<string>;

  /** Write a file */
  writeFile(uri: string, content: string): Promise<void>;

  /** Delete a file */
  deleteFile(uri: string): Promise<void>;

  /** Rename/move a file */
  renameFile(oldUri: string, newUri: string): Promise<void>;

  /** List files matching a glob pattern */
  findFiles(pattern: string, exclude?: string): Promise<string[]>;

  /** File change events */
  readonly onDidCreate: Event<string>;
  readonly onDidChange: Event<string>;
  readonly onDidDelete: Event<string>;
}

/** Fuzzy file finder with ranked results */
interface FileIndex {
  /** Build index from workspace folders */
  build(folders: WorkspaceFolder[]): Promise<void>;

  /** Update index for a single file change */
  update(event: FileChangeEvent): void;

  /** Fuzzy search for files by name */
  search(query: string, maxResults?: number): FileSearchResult[];
}

interface FileSearchResult {
  path: string;
  score: number;
  matchPositions: number[];  // Character positions that matched
}
```

### Search

```typescript
/** Workspace-wide text search via ripgrep */
interface SearchService {
  /** Search across all workspace files */
  search(query: SearchQuery): AsyncIterable<SearchResult>;

  /** Cancel an in-progress search */
  cancel(): void;
}

interface SearchQuery {
  pattern: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  includePattern?: string;   // Glob include
  excludePattern?: string;   // Glob exclude
  maxResults?: number;
}

interface SearchResult {
  uri: string;
  matches: SearchMatch[];
}

interface SearchMatch {
  range: Range;
  preview: string;
  lineNumber: number;
}
```

### Git

```typescript
/** Git operations via shell commands */
interface GitClient {
  /** Get repository root path */
  getRoot(cwd: string): Promise<string | null>;

  /** Get current branch name */
  getBranch(): Promise<string>;

  /** Get file status (modified, staged, untracked, etc.) */
  getStatus(): Promise<GitFileStatus[]>;

  /** Get diff for working tree or staged changes */
  getDiff(options?: { staged?: boolean; file?: string }): Promise<string>;

  /** Get structured diff hunks */
  getDiffHunks(options?: { staged?: boolean; file?: string }): Promise<DiffHunk[]>;

  /** Get blame information for a file */
  getBlame(filePath: string): Promise<BlameLine[]>;

  /** Get log entries */
  getLog(options?: { maxCount?: number; file?: string }): Promise<LogEntry[]>;

  /** Stage files */
  stage(files: string[]): Promise<void>;

  /** Unstage files */
  unstage(files: string[]): Promise<void>;

  /** Create a commit */
  commit(message: string, options?: { amend?: boolean }): Promise<string>;

  /** Create a new branch */
  createBranch(name: string, startPoint?: string): Promise<void>;

  /** Switch branches */
  checkout(branchOrCommit: string): Promise<void>;

  /** Push to remote */
  push(remote?: string, branch?: string): Promise<void>;

  /** Pull from remote */
  pull(remote?: string, branch?: string): Promise<void>;

  /** Stash changes */
  stash(message?: string): Promise<void>;

  /** Pop stash */
  stashPop(): Promise<void>;
}

interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  staged: boolean;
  originalPath?: string;  // For renames
}

interface BlameLine {
  lineNumber: number;
  commit: string;
  author: string;
  date: Date;
  message: string;
}

interface LogEntry {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: Date;
  message: string;
  refs: string[];
}
```

### Git Platform Integration

```typescript
/** GitHub REST API client */
interface GitHubClient {
  /** Authenticate with token */
  authenticate(token: string): void;

  /** List pull requests */
  listPullRequests(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<PullRequest[]>;

  /** Get a specific PR with full diff */
  getPullRequest(owner: string, repo: string, number: number): Promise<PullRequestDetail>;

  /** Get PR diff as text */
  getPullRequestDiff(owner: string, repo: string, number: number): Promise<string>;

  /** Submit a review */
  submitReview(owner: string, repo: string, number: number, review: ReviewSubmission): Promise<void>;

  /** Post a review comment on a specific line */
  postReviewComment(owner: string, repo: string, number: number, comment: ReviewComment): Promise<void>;

  /** Get CI/CD check status */
  getCheckStatus(owner: string, repo: string, ref: string): Promise<CheckStatus[]>;
}

interface PullRequest {
  number: number;
  title: string;
  author: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: Date;
  updatedAt: Date;
  labels: string[];
  reviewDecision?: 'approved' | 'changes_requested' | 'review_required';
}

interface PullRequestDetail extends PullRequest {
  body: string;
  headRef: string;
  baseRef: string;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PullRequestFile[];
}

interface PullRequestFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

interface ReviewSubmission {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments: ReviewComment[];
}

interface ReviewComment {
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
}

interface CheckStatus {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out';
}
```

### Settings

```typescript
/** Layered settings store */
interface SettingsStore {
  /** Get a setting value (resolves through layers: language > workspace > user > default) */
  get<T>(key: string, scope?: SettingsScope): T;

  /** Set a setting value at a specific layer */
  set(key: string, value: any, target: SettingsTarget): Promise<void>;

  /** Check if a setting has been explicitly set */
  has(key: string, scope?: SettingsScope): boolean;

  /** Get all settings matching a prefix */
  getSection(prefix: string): Record<string, any>;

  /** Reset a setting to default */
  reset(key: string, target: SettingsTarget): Promise<void>;

  /** Setting change events */
  readonly onDidChange: Event<SettingsChangeEvent>;
}

interface SettingsScope {
  languageId?: string;
  workspaceFolder?: string;
}

type SettingsTarget = 'default' | 'user' | 'workspace' | 'workspaceFolder';

interface SettingsChangeEvent {
  affectedKeys: string[];
}

/** Keybinding resolution */
interface KeybindingService {
  /** Resolve a key event to a command */
  resolve(keyEvent: KeyEvent): string | null;

  /** Register a keybinding */
  register(binding: Keybinding): Disposable;

  /** Get all keybindings for a command */
  getBindingsForCommand(commandId: string): Keybinding[];
}

interface Keybinding {
  key: string;             // e.g., "ctrl+shift+p", "cmd+k cmd+s" (chord)
  command: string;
  when?: string;           // Context condition expression
  args?: any;
}
```

### LSP Manager

```typescript
/** LSP server lifecycle management */
interface LSPManager {
  /** Start a language server for the given language */
  startServer(languageId: string, config: LSPServerConfig): Promise<LSPClient>;

  /** Stop a running server */
  stopServer(languageId: string): Promise<void>;

  /** Get the client for a language (starts server if needed) */
  getClient(languageId: string): LSPClient | null;

  /** Restart a server */
  restartServer(languageId: string): Promise<void>;

  /** Get all active servers */
  getActiveServers(): Map<string, LSPClient>;
}

interface LSPServerConfig {
  command: string;
  args?: string[];
  transport: 'stdio' | 'tcp' | 'pipe';
  initializationOptions?: Record<string, any>;
  settings?: Record<string, any>;
  rootUri?: string;
}

/** Full LSP 3.17 client */
interface LSPClient {
  readonly serverCapabilities: ServerCapabilities;

  // Document synchronization
  didOpen(uri: string, languageId: string, version: number, text: string): void;
  didChange(uri: string, version: number, changes: TextDocumentContentChangeEvent[]): void;
  didSave(uri: string, text?: string): void;
  didClose(uri: string): void;

  // Language features
  completion(uri: string, position: Position): Promise<CompletionList>;
  hover(uri: string, position: Position): Promise<Hover | null>;
  definition(uri: string, position: Position): Promise<Location[]>;
  references(uri: string, position: Position, context: ReferenceContext): Promise<Location[]>;
  rename(uri: string, position: Position, newName: string): Promise<WorkspaceEdit>;
  codeAction(uri: string, range: Range, context: CodeActionContext): Promise<CodeAction[]>;
  formatting(uri: string, options: FormattingOptions): Promise<TextEdit[]>;
  signatureHelp(uri: string, position: Position): Promise<SignatureHelp | null>;
  documentSymbol(uri: string): Promise<DocumentSymbol[]>;
  codeLens(uri: string): Promise<CodeLens[]>;

  // Diagnostics (received from server)
  readonly onDiagnostics: Event<{ uri: string; diagnostics: Diagnostic[] }>;

  // Lifecycle
  readonly onDidChangeState: Event<'starting' | 'running' | 'stopped'>;
}
```

### AI Provider System

```typescript
/** AI Provider Adapter — implemented by each provider */
interface AIProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: AICapabilities;

  /** Test connectivity and authentication */
  validate(): Promise<{ valid: boolean; error?: string }>;

  /** List available models for this provider */
  listModels(): Promise<AIModel[]>;

  /** Stream a completion (for ghost text / FIM) */
  complete(request: CompletionRequest): AsyncIterable<CompletionChunk>;

  /** Stream a chat response */
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;

  /** Stream a chat response with tool use (for agent mode) */
  chatWithTools(request: ToolChatRequest): AsyncIterable<ToolChatChunk>;
}

interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  capabilities: AICapabilities;
}

/** Provider Registry — manages all registered AI providers */
interface ProviderRegistry {
  /** Register a new provider adapter */
  register(adapter: AIProviderAdapter): Disposable;

  /** Get a provider by ID */
  get(id: string): AIProviderAdapter | null;

  /** List all registered providers */
  list(): AIProviderAdapter[];

  /** Configure a provider (API key, endpoint, etc.) */
  configure(id: string, config: Record<string, any>): void;
}

/** Model Router — routes features to configured provider/model pairs */
interface ModelRouter {
  /** Get the provider + model for a given AI feature */
  getProviderForFeature(feature: AIFeature): { adapter: AIProviderAdapter; model: string };

  /** Update routing configuration */
  setRoute(feature: AIFeature, providerId: string, model: string): void;
}

type AIFeature =
  | 'inlineCompletion'
  | 'chat'
  | 'agent'
  | 'review'
  | 'quickFix'
  | 'explain'
  | 'commit';
```

### Agent System

```typescript
/** Agent Orchestrator — autonomous multi-step task execution */
interface AgentOrchestrator {
  /** Start an agent session with a user instruction */
  start(instruction: string, context: AgentContext): AgentSession;

  /** Resume a paused session */
  resume(sessionId: string, userResponse?: string): void;

  /** Cancel an active session */
  cancel(sessionId: string): void;
}

interface AgentSession {
  readonly id: string;
  readonly status: 'planning' | 'executing' | 'waiting_approval' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';
  readonly plan: AgentStep[];
  readonly currentStep: number;
  readonly activityLog: ActivityLogEntry[];
  readonly pendingApprovals: PendingApproval[];

  readonly onStatusChange: Event<AgentSession>;
  readonly onActivityLog: Event<ActivityLogEntry>;
  readonly onApprovalRequired: Event<PendingApproval>;
}

interface AgentStep {
  id: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  toolCalls: ToolCallRecord[];
}

interface ToolCallRecord {
  tool: string;
  arguments: Record<string, any>;
  result?: string;
  error?: string;
  approved?: boolean;
  timestamp: Date;
}

interface ActivityLogEntry {
  timestamp: Date;
  type: 'thought' | 'tool_call' | 'tool_result' | 'approval_request' | 'user_input' | 'error' | 'completion';
  content: string;
  metadata?: Record<string, any>;
}

interface PendingApproval {
  id: string;
  type: 'file_edit' | 'file_create' | 'file_delete' | 'terminal_run' | 'git_ops';
  description: string;
  diff?: DiffHunk[];          // For file edits: show the diff
  command?: string;           // For terminal: the command to run
  filePath?: string;
}

interface AgentContext {
  instruction: string;
  activeFile?: string;
  selectedText?: string;
  openFiles: string[];
  diagnostics: Diagnostic[];
  recentTerminalOutput?: string;
  gitStatus?: GitFileStatus[];
  gitDiff?: string;
}

/** Agent Tool — all tools the agent can invoke */
interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, any>;
  readonly requiresApproval: boolean;

  execute(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

interface ToolExecutionContext {
  workspaceRoot: string;
  approvalCallback: (approval: PendingApproval) => Promise<boolean>;
  cancellationToken: CancellationToken;
}

interface ToolExecutionResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, any>;
}
```

### AI Review System

```typescript
/** PR Review Engine */
interface ReviewEngine {
  /** Run AI review on a pull request diff */
  reviewDiff(diff: string, context: ReviewContext): AsyncIterable<ReviewAnnotation>;

  /** Review a specific file's changes */
  reviewFile(fileDiff: string, context: ReviewContext): Promise<ReviewAnnotation[]>;
}

interface ReviewContext {
  prTitle: string;
  prDescription: string;
  baseRef: string;
  headRef: string;
  language?: string;
  existingComments?: ReviewComment[];
  categories: ReviewCategory[];
}

type ReviewCategory = 'bugs' | 'security' | 'performance' | 'style' | 'testing' | 'documentation';

interface ReviewAnnotation {
  file: string;
  line: number;
  endLine?: number;
  severity: ReviewSeverity;
  category: ReviewCategory;
  message: string;
  suggestedFix?: string;
  confidence: number;       // 0.0 - 1.0
}

type ReviewSeverity = 'error' | 'warning' | 'info' | 'hint';

/** Diff Chunker — splits large diffs into AI-manageable pieces */
interface DiffChunker {
  /** Split a diff into chunks that fit within a context window */
  chunk(diff: string, maxTokens: number): DiffChunk[];
}

interface DiffChunk {
  files: string[];
  diff: string;
  tokenEstimate: number;
}

/** Review Submitter — posts reviews to git platforms */
interface ReviewSubmitter {
  /** Submit review annotations to the platform */
  submit(
    platform: 'github' | 'gitlab' | 'bitbucket',
    prIdentifier: { owner: string; repo: string; number: number },
    annotations: ReviewAnnotation[],
    decision: 'approve' | 'request_changes' | 'comment'
  ): Promise<void>;
}
```

### Extension Host

```typescript
/** Extension lifecycle management */
interface ExtensionHost {
  /** Discover extensions from built-in + installed paths */
  discover(paths: string[]): Promise<ExtensionManifest[]>;

  /** Activate an extension */
  activate(extensionId: string): Promise<void>;

  /** Deactivate an extension */
  deactivate(extensionId: string): Promise<void>;

  /** Get all discovered extensions */
  getExtensions(): ExtensionInfo[];

  /** Check if an extension is active */
  isActive(extensionId: string): boolean;
}

interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description?: string;
  engines: { hone: string };
  activationEvents: string[];
  contributes: ExtensionContributions;
  main: string;
}

interface ExtensionContributions {
  languages?: LanguageContribution[];
  lspServers?: LSPServerContribution[];
  commands?: CommandContribution[];
  configuration?: ConfigurationContribution;
  snippets?: SnippetContribution[];
  keybindings?: KeybindingContribution[];
  themes?: ThemeContribution[];
  views?: ViewContribution[];
}

interface ExtensionInfo {
  manifest: ExtensionManifest;
  status: 'discovered' | 'activated' | 'deactivated' | 'error';
  activationTime?: number;
  error?: string;
}
```

---

## 5. Implementation Guide

### Workspace (`workspace/`)

**workspace.ts** — Multi-root workspace management:
- Maintains an ordered array of `WorkspaceFolder` objects
- Supports `.hone-workspace` files (JSON format listing folder paths + settings)
- `readFile()` / `writeFile()` resolve URIs to filesystem paths, handle encoding
- Emits events on folder add/remove

**file-watcher.ts** — File system watching:
- Uses Perry's `fs.watch()` for native file system events
- Debounces rapid changes (100ms window)
- Respects `.gitignore` and workspace exclude patterns
- Maintains a set of watched paths, auto-updates when folders change
- On macOS: uses FSEvents (via Perry). On Linux: inotify. On Windows: ReadDirectoryChangesW.

**file-index.ts** — Fuzzy file finder:
- On workspace open, walks all files and builds an in-memory trie/index
- Fuzzy matching algorithm: score based on consecutive character matches, word boundary bonus, path segment bonus
- Results ranked by score, with recency bias (recently opened files score higher)
- Index updated incrementally via file watcher events
- Excludes: `node_modules/`, `.git/`, binary files, user-configured excludes

### Search (`search/`)

**ripgrep.ts** — Ripgrep integration:
- Spawns `rg` (ripgrep) as a child process
- Passes search query, flags (regex, case-sensitive, whole-word), include/exclude patterns
- Parses JSON output (`--json` flag) for structured results
- Streams results via AsyncIterable (yields SearchResult objects as rg outputs them)
- Cancellation: kills the child process on cancel
- Fallback: if ripgrep not found, falls back to manual file walking + string/regex search

**search-model.ts** — Search result types and aggregation:
- Groups matches by file
- Provides match count and file count
- Supports replace preview (show what the file would look like after replacement)

### Git (`git/`)

**git-client.ts** — Shell-based git operations:
- All operations shell out to `git` via `child_process.exec`
- Parses stdout for structured data
- Handles error codes and stderr messages
- Caches `git rev-parse --show-toplevel` result
- Thread-safe: serializes git operations to avoid concurrent modifications

**blame.ts** — `git blame --porcelain` parser:
- Parses porcelain format into structured BlameLine objects
- Handles binary files (returns empty)
- Caches blame data, invalidates on file save

**diff.ts** — Unified diff parser:
- Parses `git diff` output into structured DiffHunk objects
- Handles renames, binary files, mode changes
- Supports `--stat` for summary

**status.ts** — `git status --porcelain=v2` parser:
- Parses V2 porcelain format for precise status codes
- Maps status codes to enum values (modified, added, deleted, renamed, etc.)
- Handles submodule and worktree status

**log.ts** — `git log --pretty=format:...` parser:
- Custom format string for easy parsing
- Supports file-specific log, date ranges, author filtering
- Parses refs (branches, tags) from `%D` decorator

**platform/github.ts** — GitHub REST API client:
- Uses `fetch()` (Perry built-in) for HTTP requests
- Auth: Bearer token from settings (personal access token or OAuth)
- Implements: list PRs, get PR detail, get PR diff, submit review, post review comment, get checks
- Rate limit handling: respects `X-RateLimit-*` headers, backs off when near limit
- Pagination: follows `Link` headers for multi-page results

**platform/gitlab.ts** — GitLab REST API client:
- Similar structure to GitHub client
- Auth: Private token or OAuth
- MR-specific endpoints

**platform/bitbucket.ts** — Bitbucket REST API client:
- Bitbucket Cloud API v2.0
- Auth: App password or OAuth

### Settings (`settings/`)

**settings-store.ts** — Layered configuration:
- Layers (lowest to highest priority): default → user → workspace → workspaceFolder → language-specific
- Default layer: hardcoded defaults for all known settings
- User layer: `~/.hone/settings.json`
- Workspace layer: `.hone/settings.json` in workspace root
- Language-specific: `[languageId]` sections in any layer
- Environment variable expansion: `${env:VAR_NAME}` in string values
- JSON Schema validation on write
- File watching on settings files for live reload

```json
// Settings resolution example:
// Default:    { "editor.tabSize": 4 }
// User:       { "editor.tabSize": 2 }
// Workspace:  { "[python]": { "editor.tabSize": 4 } }
//
// get("editor.tabSize") → 2 (user overrides default)
// get("editor.tabSize", { languageId: "python" }) → 4 (python-specific overrides)
```

**keybindings.ts** — Keybinding resolution:
- Default keybindings: hardcoded map of key chords → commands
- User overrides: `~/.hone/keybindings.json`
- Key chord parsing: `ctrl+shift+p` → modifiers + key. Chord sequences: `ctrl+k ctrl+c` → two-step binding.
- `when` clause evaluation: context expressions like `editorTextFocus && !suggestWidgetVisible`
- Platform-specific defaults: `cmd+` on macOS, `ctrl+` on others
- Conflict detection: warn if multiple bindings match the same key chord in the same context

**schema.ts** — Settings schema:
- JSON Schema definition for all known settings
- Used for validation, intellisense in settings UI, and documentation
- Categories: editor, workbench, terminal, ai, git, search, debug, extensions

### Protocols — LSP (`protocols/lsp/`)

**lsp-manager.ts** — Server lifecycle:
- Maintains a map of languageId → LSPClient
- Auto-starts servers when a file of that language opens (lazy activation)
- Auto-stops servers when no files of that language are open (with 60s grace period)
- Restart on crash (up to 3 times, then disable and notify user)
- Reads server configuration from settings and extension contributions

**lsp-client.ts** — Full LSP 3.17 client:
- JSON-RPC 2.0 over stdio (primary) or TCP
- Initialization handshake: `initialize` → `initialized`
- Capability negotiation: client advertises capabilities, server responds with its capabilities
- Document synchronization: open/change/save/close
- Full protocol implementation: completion, hover, definition, references, rename, code action, formatting, signature help, document symbols, code lens, folding range, selection range
- Incremental sync (TextDocumentSyncKind.Incremental) when server supports it
- Request cancellation via `$/cancelRequest`
- Progress reporting via `$/progress`
- Diagnostic handling: receives `textDocument/publishDiagnostics`, stores per-file

**capabilities.ts** — Feature detection:
- Maps server capabilities to available features
- Helper functions: `supportsCompletion()`, `supportsHover()`, `supportsFormatting()`, etc.
- Registers provider-specific capabilities (e.g., completion trigger characters)

### Protocols — DAP (`protocols/dap/`)

**dap-manager.ts** — Debug adapter lifecycle:
- Launches debug adapters based on `launch.json` / debug configuration
- Manages adapter process lifecycle
- Supports launch and attach modes

**dap-client.ts** — Debug Adapter Protocol client:
- JSON message protocol over stdio
- Core requests: initialize, launch/attach, setBreakpoints, continue, next, stepIn, stepOut, pause, disconnect
- Receives: stopped, continued, exited, terminated events
- Retrieves: threads, stackTrace, scopes, variables, evaluate
- Handles breakpoint events (verified, changed)

### Protocols — Formatter (`protocols/formatter/`)

**formatter.ts** — External formatter integration:
- Runs formatter as child process with file content on stdin, formatted content on stdout
- Supports: prettier, black, rustfmt, gofmt, clang-format
- Configuration: formatter command + args per language
- Timeout handling (5s default)
- Format on save integration
- Diff computation to apply minimal edits (avoids cursor jump)

### AI Provider System (`ai/provider/`)

**ai-protocol.ts** — Core interface (mirrors `@honeide/api` AIProviderAdapter):
- Defines the internal adapter interface
- Includes `validate()` for connectivity testing
- Includes `listModels()` for dynamic model discovery

**provider-registry.ts** — Provider management:
- Stores registered adapters by ID
- Reads provider configuration from settings (`ai.providers.*`)
- Auto-registers built-in adapters on startup
- Supports dynamic registration by extensions

**model-router.ts** — Feature → provider mapping:
- Reads `ai.features.*` from settings
- Returns the correct adapter + model string for each AI feature
- Fallback logic: if configured provider unavailable, try others
- Validates that the routed provider supports the feature (e.g., FIM for inline completion)

**token-counter.ts** — Token estimation:
- Rough token counting per provider (different tokenizers)
- Uses character-based heuristic (1 token ≈ 4 chars for English, adjusted per provider)
- Used by diff-chunker and context-builder to stay within context windows

### AI Provider Adapters (`ai/provider/adapters/`)

Each adapter implements `AIProviderAdapter` and handles the provider-specific API format:

**anthropic.ts** — Claude (Messages API):
- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`
- Streaming: SSE with `event: content_block_delta`
- Tool use: `tool_use` content blocks → `tool_result` responses
- FIM: not native, simulated via chat prompt
- Vision: supported (image content blocks)
- Models: claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5

**openai.ts** — GPT / o-series (Chat Completions):
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Headers: `Authorization: Bearer <key>`
- Streaming: SSE with `data: {...}` chunks
- Tool use: `function_calling` with tool definitions
- FIM: supported via Codex models (suffix parameter)
- Vision: supported via image_url content parts
- Models: gpt-5, gpt-5-mini, o3, o4-mini

**google.ts** — Gemini (Generative Language API):
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
- Auth: API key as query parameter
- Streaming: server-sent events
- Tool use: `functionDeclarations` in request
- Vision: supported (inline_data parts)
- Models: gemini-2.5-pro, gemini-2.5-flash

**ollama.ts** — Local models:
- Endpoint: `http://localhost:11434/api/chat` (configurable)
- No auth required
- Streaming: NDJSON stream
- Tool use: varies by model (some support it, some don't)
- FIM: varies by model
- Model discovery: `GET /api/tags`

**openai-compat.ts** — Generic OpenAI-compatible:
- Same protocol as OpenAI adapter but with configurable endpoint
- Works with: LiteLLM, vLLM, text-generation-inference, LocalAI, LM Studio
- Endpoint and API key from settings

**bedrock.ts** — AWS Bedrock:
- Uses AWS SigV4 signing for authentication
- Region from settings or AWS config
- Streaming: uses Bedrock's invoke-model-with-response-stream
- Translates between Hone's format and Bedrock's Anthropic/AI21/Meta formats
- Models: anthropic.claude-*, meta.llama*, ai21.jamba*

**vertex.ts** — Google Cloud Vertex AI:
- OAuth2 authentication via service account or application default credentials
- Endpoint: `https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models/{model}:streamGenerateContent`
- Same payload format as Gemini API

**azure-openai.ts** — Azure OpenAI Service:
- Endpoint: `https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-01`
- Auth: API key or Azure AD token
- Same payload as OpenAI but different URL structure

### AI Inline Completion (`ai/inline/`)

**completion-provider.ts** — Ghost text engine:
- Triggers on: pause after typing (debounced), explicit request (Ctrl+Space alternative)
- Collects context: current file content, cursor position, open files for cross-file context
- Formats request using FIM adapter
- Sends to configured inline completion provider
- Streams response, shows as ghost text in editor
- Accepts: Tab to accept full completion, Ctrl+Right to accept word-by-word
- Cancels on: cursor move, new typing, escape

**fim-adapter.ts** — Fill-in-the-middle formatting:
- Each provider has different FIM format:
  - Anthropic: Chat-based with instructions "Complete the code at the cursor"
  - OpenAI: `suffix` parameter in completion request
  - Ollama: model-specific (Qwen uses `<|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>`)
  - Google: Chat-based
- Extracts prefix (text before cursor) and suffix (text after cursor)
- Truncates to fit within context window

**debouncer.ts** — Request debouncing:
- Waits 300ms after last keystroke (configurable)
- Cancels pending requests when user types again
- Shorter delay for explicit trigger (50ms)
- No delay for accept-word (immediate next chunk)

**cache.ts** — LRU completion cache:
- Key: hash of (prefix + suffix + cursor position)
- Stores recent completions (default: 50 entries)
- Returns cached completion if available (instant ghost text)
- Cache invalidation: on file edit, on provider change

### AI Chat (`ai/chat/`)

**chat-model.ts** — Chat history management:
- Maintains conversation history (array of ChatMessage)
- Supports multiple chat sessions (tabs)
- Conversation truncation: when history exceeds context window, summarize older messages
- Persist conversations to disk (workspace-specific)
- Message metadata: timestamp, token count, model used

**context-collector.ts** — Automatic context gathering:
- Collects and formats context for the AI:
  - Active file content (or selection)
  - Open file list (paths + languages)
  - Current diagnostics (errors, warnings)
  - Recent terminal output (last N lines)
  - Git status and recent diff
  - Workspace structure (top-level files/dirs)
- Formats as structured context block prepended to user message
- Respects privacy settings (`ai.privacy.excludePatterns`, `ai.privacy.sendFileContents`)

**streaming-renderer.ts** — Streaming response handling:
- Accumulates streaming text chunks into complete response
- Parses markdown incrementally (handles partial code blocks, lists, etc.)
- Extracts code blocks with language tags
- Signals rendering updates to the UI

**code-actions.ts** — Quick AI actions from editor context:
- "Explain this code" — sends selection to chat with explanation prompt
- "Refactor this code" — sends selection with refactoring instructions
- "Fix this error" — sends diagnostic + surrounding code with fix request
- "Write tests" — sends function/class with test generation prompt
- "Add documentation" — sends code with documentation generation prompt
- Each action creates a new chat message with appropriate system prompt

### AI Agent (`ai/agent/`)

**orchestrator.ts** — The core agent loop:
```
1. Receive user instruction
2. Build context (via context-builder.ts)
3. Send to AI with tool definitions
4. Receive AI response (text + tool calls)
5. For each tool call:
   a. Check if tool requires approval
   b. If yes: pause, emit approval request, wait
   c. If no (or approved): execute tool
   d. Collect result
6. Send tool results back to AI
7. Repeat from step 4 until AI signals completion
8. Log all actions to activity log
```
- Max iterations: configurable (default 25), prevents infinite loops
- Error recovery: if a tool fails, send error to AI for retry/alternative
- Session persistence: save/restore agent sessions

**planner.ts** — Intent decomposition:
- Pre-processing step: sends user instruction to AI with a planning prompt
- AI returns a structured plan (numbered steps)
- Plan displayed to user for review before execution
- User can edit/reorder/remove steps
- Plan used as high-level guidance during execution

**tools.ts** — Tool definitions:
- Defines all 15+ tools with JSON Schema input definitions
- Maps tool names to implementations
- Configurable approval requirements (from settings `ai.agent.autoApprove`)

**tool-impls/** — Individual tool implementations:

*file-read.ts*: Reads file contents, supports line range specification. Returns file content as string.

*file-edit.ts*: Applies edits to files. Input: file path + array of edits (old_text → new_text). Uses hone-editor's TextBuffer for precise editing. Computes diff for approval display. On approval, applies edit and saves.

*file-create.ts*: Creates new files with specified content. Creates parent directories if needed. Requires approval.

*file-delete.ts*: Deletes files. Requires approval. Shows file content in approval view.

*file-rename.ts*: Renames/moves files. Updates imports if possible (via LSP rename). Requires approval.

*terminal-run.ts*: Executes shell commands in a terminal. Captures output. Timeout configurable (default 30s). Requires approval. Shows command in approval view.

*terminal-read.ts*: Reads recent terminal output (last N lines). No approval needed.

*git-ops.ts*: Git operations (diff, status, stage, commit, branch, checkout). Read ops (diff, status) don't need approval. Write ops (stage, commit, branch) need approval.

*search.ts*: Workspace search (uses ripgrep via SearchService). Returns matching files and lines. No approval needed.

*lsp-query.ts*: LSP queries (go to definition, find references, get diagnostics). No approval needed. Returns structured results.

*web-fetch.ts*: Fetches URL content. Used for reading documentation. Converts HTML to text. No approval needed.

*user-ask.ts*: Prompts user for input. Returns user's text response.

*user-show-diff.ts*: Shows proposed file changes as a diff view. Returns approval/rejection status.

**approval-flow.ts** — Approval coordination:
- When a tool requires approval, pauses the agent loop
- Emits an event with the pending approval details
- UI (hone-ide) shows approval view with diff/command/details
- User can: approve, reject, or modify the proposed change
- On approve: tool executes, result sent to AI
- On reject: "rejected by user" sent to AI, AI adjusts approach

**context-builder.ts** — Rich context for AI:
- Builds a comprehensive context object from current IDE state
- Includes: workspace structure, open files, active file content, cursor position, selection, diagnostics, terminal history, git state
- Truncates to fit within context window (token-counted)
- Prioritizes: active file > open files > workspace structure

**error-recovery.ts** — Automatic retry on failures:
- If a terminal command fails (non-zero exit), sends error output to AI
- If tests fail after an edit, AI can read test output and fix
- Configurable: `ai.agent.stopOnTestFailure` (default: false, let AI try to fix)
- Max retries per step: 3

**activity-log.ts** — Transparency log:
- Records every action the agent takes: thought process, tool calls, results, approvals
- Timestamped entries with structured metadata
- Displayed in Agent Activity view in hone-ide
- Exportable as JSON for debugging/auditing

### AI Review (`ai/review/`)

**review-engine.ts** — PR review orchestration:
- Input: PR diff + metadata (title, description, commits, CI status)
- Chunks the diff to fit within context window
- For each chunk: sends to AI with review instructions
- Collects annotations from all chunks
- Deduplicates and ranks annotations by severity
- Returns: ReviewAnnotation[]

Review prompt structure:
```
You are reviewing a pull request. Analyze the code changes and identify:
- Bugs: null derefs, race conditions, type mismatches, logic errors
- Security: injection, auth bypass, secrets exposure, CSRF
- Performance: N+1 queries, unnecessary allocations, missing caching
- Style: naming, dead code, missing docs, inconsistency
- Testing: missing test coverage, flaky test patterns

Return a JSON array of annotations: { file, line, severity, category, message, suggestedFix }
```

**diff-chunker.ts** — Intelligent diff splitting:
- Splits unified diff by file boundaries
- If a single file's diff exceeds the token limit, splits by hunk groups
- Maintains enough context (surrounding unchanged lines) for AI to understand
- Estimates tokens using token-counter
- Groups related files together when possible (e.g., implementation + test)

**annotation-parser.ts** — AI response parsing:
- Extracts JSON annotations from AI response (may be embedded in markdown)
- Validates annotation structure (required fields, valid severity values)
- Maps file paths back to PR file paths (handles relative/absolute differences)
- Deduplicates: same file + same line + similar message = merge

**review-submitter.ts** — Platform submission:
- Converts ReviewAnnotation[] to platform-specific review comments
- GitHub: `POST /repos/{owner}/{repo}/pulls/{number}/reviews`
- GitLab: `POST /projects/{id}/merge_requests/{number}/notes`
- Bitbucket: `POST /repositories/{workspace}/{repo}/pullrequests/{number}/comments`
- Supports batch submission (one review with multiple comments)
- Maps severity to appropriate platform formatting (emoji prefixes, labels)

### Extension Host (`extensions/`)

**extension-host.ts** — Lifecycle management:
- Discovery: scans built-in extensions dir and installed extensions dir
- Activation events: `onLanguage:*`, `onCommand:*`, `workspaceContains:*`, `*` (startup)
- Lazy activation: extensions only activated when their activation event fires
- Calls extension's `activate(context)` function
- Provides `ExtensionContext` with subscriptions, storage paths
- Deactivation: calls `deactivate()`, disposes all subscriptions
- Error isolation: extension errors logged but don't crash the host

**extension-api-impl.ts** — API bridge:
- Implements every namespace from `@honeide/api` (commands, workspace, editor, languages, ui, debug, terminal, ai)
- Bridges API calls to core services:
  - `hone.commands.registerCommand()` → CommandRegistry
  - `hone.workspace.openTextDocument()` → WorkspaceService
  - `hone.languages.registerCompletionProvider()` → wraps provider, routes to LSP or custom
  - `hone.ui.showQuickPick()` → UI layer (emits event for hone-ide to handle)
  - `hone.ai.registerAIProvider()` → ProviderRegistry

**manifest.ts** — Extension manifest processing:
- Parses `hone-extension.json` files
- Validates against manifest schema
- Resolves relative paths
- Extracts activation events and contributions

**registry.ts** — Extension registry:
- Stores all discovered extensions
- Indexes by ID, language, activation event
- Provides query methods for the extension host
- Handles extension dependencies (if declared)

---

## 6. Perry Integration

### Build Command
```bash
perry compile src/index.ts --target macos --output-type library
```

### Dependencies
- Links against `@honeide/editor` and `@honeide/terminal` libraries
- Uses Perry's native `child_process` for spawning LSP servers, git, ripgrep, formatters
- Uses Perry's native `fs` for file operations and watching
- Uses Perry's native `net` for TCP connections
- Uses Perry's `fetch()` or HTTP module for AI provider API calls
- Uses `perry/system` keychain for secure API key storage

### No FFI Required
hone-core is pure TypeScript business logic. No platform-specific rendering. All platform abstractions come from Perry's built-in modules.

### npm Publishing
```json
{
  "name": "@honeide/core",
  "version": "1.0.0",
  "main": "src/index.ts",
  "dependencies": {
    "@honeide/api": "^1.0.0",
    "@honeide/editor": "^1.0.0",
    "@honeide/terminal": "^1.0.0"
  },
  "license": "MIT"
}
```

---

## 7. Test Strategy

### Unit Tests

**Workspace:**
- File index fuzzy search accuracy (known queries → expected results)
- Settings layering (verify priority resolution)
- File watcher debouncing
- Glob pattern matching

**Git:**
- Status parsing (all status codes)
- Blame parsing (porcelain format)
- Diff parsing (add, delete, modify, rename, binary)
- Log parsing

**Settings:**
- Layer resolution (default < user < workspace < language)
- Environment variable expansion
- Schema validation
- Keybinding resolution (modifiers, chords, conflicts, when clauses)

**LSP:**
- JSON-RPC message framing (Content-Length header parsing)
- Capability negotiation
- Request/response matching (by ID)
- Notification handling
- Request cancellation

**AI Providers:**
- Each adapter: mock HTTP responses, verify request format
- Streaming: verify chunk parsing for each provider format
- Tool use: verify tool call extraction for each provider format
- Error handling: rate limits, auth failures, network errors

**AI Inline:**
- FIM formatting per provider
- Debouncing (verify timing)
- Cache hit/miss
- Cancellation on typing

**AI Chat:**
- Context collection (verify all context types included)
- Conversation truncation
- Code block extraction from streaming markdown

**AI Agent:**
- Orchestrator loop (mock tool calls, verify sequence)
- Approval flow (verify pause/resume)
- Error recovery (mock failure, verify retry)
- Max iterations enforcement

**AI Review:**
- Diff chunking (verify token limits respected)
- Annotation parsing (valid and malformed responses)
- Deduplication logic

**Extensions:**
- Manifest parsing and validation
- Activation event matching
- API bridge (mock core services, verify calls)

### Integration Tests

- LSP: Start `typescript-language-server`, open a TS file, verify completions
- Git: In a test repo, run status/diff/blame/log
- AI: With mock HTTP server, run full chat/agent/review flow
- Extensions: Load a test extension, verify activation and API calls

### Performance Tests

- File index: build index for 100K files, measure time and memory
- Search: ripgrep search in large codebase, measure latency
- AI streaming: measure time-to-first-token through adapter layer
- Settings resolution: 10K lookups, measure latency

---

## 8. Phased Milestones

### Phase 1: Workspace Foundation (Weeks 1-3)
- Workspace management (multi-root, file ops)
- File watcher
- File index (fuzzy finder)
- Settings store (layered, schema validation)
- Keybinding system

### Phase 2: Search & Git (Weeks 4-6)
- Ripgrep integration
- Git client (status, diff, blame, log, stage, commit)
- GitHub REST API client (list PRs, get PR diff)

### Phase 3: AI Provider Layer (Weeks 7-10)
- Provider registry and model router
- Anthropic adapter (Claude Messages API)
- OpenAI adapter (Chat Completions)
- Ollama adapter (local models)
- OpenAI-compatible adapter (generic endpoints)
- Provider validation and model listing

### Phase 4: AI Features (Weeks 11-16)
- Inline completion (ghost text provider, FIM, debouncing, caching)
- Chat (history, context collection, streaming, code actions)
- Token counter

### Phase 5: LSP & DAP (Weeks 17-20)
- LSP client (full 3.17)
- LSP manager (server lifecycle)
- DAP client
- Formatter integration

### Phase 6: Agent Mode (Weeks 21-26)
- Agent orchestrator
- All tool implementations (file, terminal, git, search, LSP, web)
- Approval flow
- Error recovery
- Activity log
- Planner

### Phase 7: PR Review & Enterprise (Weeks 27-30)
- Review engine
- Diff chunker
- Annotation parser
- Review submitter (GitHub, GitLab)
- Bedrock adapter (AWS)
- Vertex adapter (GCP)
- Azure OpenAI adapter
- Google Gemini adapter

### Phase 8: Extension System (Weeks 31-34)
- Extension host
- Extension API implementation bridge
- Manifest processing
- Extension registry
- Lazy activation

### Phase 9: Polish & Publish (Weeks 35-38)
- Task runner
- GitLab / Bitbucket platform clients
- Comprehensive test suite
- Performance optimization
- Publish `@honeide/core@0.1.0`

---

## 9. Open Questions / Risks

1. **Context window management**: AI providers have different context limits. The token counter is heuristic-based. Risk: over/under-counting tokens leads to truncated requests or wasted context. Mitigation: err on the side of under-counting, test with real providers.

2. **AI provider API stability**: Providers change APIs (Anthropic beta headers, OpenAI tool format changes). Mitigation: adapter pattern isolates changes to single files.

3. **Agent safety**: The agent can edit files, run commands, and interact with git. A runaway agent could cause damage. Mitigation: approval flow for destructive actions, max iteration limit, configurable auto-approve settings.

4. **LSP server compatibility**: Different LSP servers implement the protocol differently, with quirks and extensions. Mitigation: test with top 5 servers (typescript-language-server, pyright, rust-analyzer, gopls, clangd).

5. **Perry child_process**: Agent tools and LSP depend heavily on spawning child processes. Perry's child_process implementation must be robust (stdin/stdout piping, signal handling, exit codes). Risk: Perry bugs in child_process could block core functionality.

6. **Ripgrep dependency**: Search depends on ripgrep being installed. Risk: not available on all systems. Mitigation: fallback to manual search (slower), and consider bundling a compiled ripgrep binary.

7. **API key security**: Storing API keys in JSON settings files is insecure. Mitigation: support `${env:VAR}` expansion, and use `perry/system` keychain for secure storage on supported platforms.

8. **Extension sandboxing**: Perry compiles extensions to native code in-process. A malicious extension has full access. Mitigation: curated marketplace, code review. Long-term: process isolation.

9. **Git operations on large repos**: `git status` and `git diff` can be slow on very large repositories. Mitigation: async execution, caching, incremental updates via file watcher.

10. **Review accuracy**: AI code review may produce false positives or miss real issues. Mitigation: confidence scores on annotations, user feedback loop, configurable severity threshold.
