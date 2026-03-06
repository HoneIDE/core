# CLAUDE.md — @honeide/core

## What this repo is

Headless TypeScript services for Hone IDE. No UI, no native code, no platform dependencies.
All modules are pure TypeScript and tested with `bun test`.

## Commands

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun run typecheck     # tsc --noEmit
```

## Rules

- **No UI code** — zero DOM, zero native calls, zero perry/ui imports
- **No Rust** — all Rust lives in `../perry/` (Perry compiler) or `../perry-ui-macos/` (UI runtime)
- **Test everything** — every new module gets a test file in `tests/`
- **Tests use `bun:test`** — import from `'bun:test'`, NOT vitest

## Structure

```
src/
├── index.ts              # re-exports all public APIs
├── workspace/
│   ├── workspace.ts      # Workspace class (multi-root)
│   ├── file-watcher.ts   # FileWatcher (debounced fs.watch)
│   ├── file-index.ts     # FileIndex (trie-based fuzzy search)
│   └── index.ts
├── settings/
│   ├── schema.ts         # SettingSchema, BUILTIN_SCHEMA, validateSetting
│   ├── settings-store.ts # SettingsStore (layered: default→user→workspace→language)
│   ├── keybindings.ts    # KeybindingResolver, parseKey, parseChord, evaluateWhen
│   └── index.ts
├── git/
│   ├── status.ts         # parseGitStatus, getStagedFiles, etc.
│   ├── diff.ts           # parseUnifiedDiff, countAdditions/Deletions
│   ├── log.ts            # parseGitLog, parseGitBranches
│   ├── git-client.ts     # GitClient (execSync wrapper)
│   └── index.ts
├── search/
│   ├── search-model.ts   # searchFileContent, computeReplace, isTextFile
│   └── index.ts
├── protocols/
│   ├── lsp/
│   │   ├── json-rpc.ts       # MessageParser, JSON-RPC helpers
│   │   ├── capabilities.ts   # Client/Server capabilities
│   │   ├── lsp-types.ts      # Position, Range, Diagnostic, etc.
│   │   └── index.ts
│   └── dap/
│       ├── dap-types.ts          # DAP message types
│       ├── breakpoint-manager.ts # BreakpointManager
│       └── index.ts
├── ai/
│   ├── provider/
│   │   ├── ai-protocol.ts       # AIProviderAdapter interface
│   │   ├── provider-registry.ts # ProviderRegistry
│   │   ├── model-router.ts      # ModelRouter (feature→model routing)
│   │   ├── token-counter.ts     # Token estimation helpers
│   │   ├── adapters/anthropic.ts
│   │   ├── adapters/openai.ts
│   │   └── index.ts
│   ├── inline/
│   │   ├── completion-provider.ts # InlineCompletionProvider
│   │   ├── fim-adapter.ts        # FIM formatting per provider
│   │   ├── debouncer.ts          # CompletionDebouncer
│   │   ├── cache.ts              # CompletionCache (LRU)
│   │   └── index.ts
│   ├── chat/
│   │   ├── chat-model.ts         # ChatModel, sessions, messages
│   │   ├── context-collector.ts  # ContextCollector
│   │   ├── streaming-renderer.ts # StreamingRenderer, splitMarkdownSegments
│   │   ├── code-actions.ts       # Explain/Refactor/Fix/Test prompts
│   │   └── index.ts
│   ├── agent/
│   │   ├── orchestrator.ts       # AgentOrchestrator (plan+execute loop)
│   │   ├── planner.ts            # AgentPlan (step management)
│   │   ├── activity-log.ts       # ActivityLog
│   │   ├── tools.ts              # 15 tool definitions
│   │   ├── context-builder.ts    # System prompt builder
│   │   └── index.ts
│   └── review/
│       ├── review-engine.ts      # ReviewEngine
│       ├── diff-chunker.ts       # chunkDiff, token-aware splitting
│       ├── annotation-parser.ts  # Parse AI annotations
│       ├── review-types.ts       # Types
│       └── index.ts
└── extensions/
    ├── manifest.ts           # parseManifest, hone-extension.json
    ├── registry.ts           # ExtensionRegistry
    ├── extension-host.ts     # ExtensionHost (lifecycle)
    └── index.ts

tests/
├── workspace.test.ts
├── file-index.test.ts
├── file-watcher.test.ts
├── settings.test.ts
├── git.test.ts
├── search.test.ts
├── lsp.test.ts
├── dap.test.ts
├── ai-provider.test.ts
├── ai-inline.test.ts
├── ai-chat.test.ts
├── ai-agent.test.ts
├── ai-review.test.ts
└── extensions.test.ts
```

## Adding a new module

1. Create `src/<module>/` directory with implementation + `index.ts`
2. Add `export * from './<module>/index'` to `src/index.ts`
3. Create `tests/<module>.test.ts` with comprehensive tests
4. Run `bun test` — all tests must pass

## Settings system

The settings store uses a 4-layer priority system (highest wins):
```
language overrides > workspace overrides > user settings > defaults
```

Schema lives in `src/settings/schema.ts`. Every setting needs:
- `type`: 'string' | 'number' | 'boolean' | 'array' | 'object'
- `default`: a valid default value
- `description`: human-readable string
- `enum` (optional): allowed string values

## Keybinding system

Key format: `ctrl+shift+p` (modifiers then key, `+` separated).
Chord format: `ctrl+k ctrl+c` (two key expressions, space separated).
When-clauses: `editorTextFocus && !editorReadonly`, support `&&`, `||`, `!`, `==`, `!=`.

## Slice plan

See `../INTEGRATED_PLAN.md` for the full feature roadmap (audited 2026-03-04). 499 tests passing.

**Fully done (core logic + tests):**
- Slice 1: `workspace/` ✅ (59 tests)
- Slice 2: `settings/` ✅ (59 tests)
- Slice 9: `ai/inline/` ✅ (41 tests)
- Slice 10: `ai/chat/` ✅ (56 tests)

**Done but with gaps (tests pass, some files missing):**
- Slice 4: `git/` ⚠️ (39 tests) — missing: blame.ts, platform/ (github, gitlab, bitbucket)
- Slice 5: `search/` ⚠️ (42 tests) — missing: ripgrep.ts
- Slice 6: `protocols/lsp/` ⚠️ (41 tests) — types only; missing: lsp-manager.ts (lifecycle)
- Slice 7: `protocols/dap/` ⚠️ (25 tests) — types only; missing: dap-manager.ts, tasks/
- Slice 8: `ai/provider/` ⚠️ (35 tests) — 2 of 8 adapters; missing: google, ollama, openai-compat, bedrock, vertex, azure-openai
- Slice 12: `ai/agent/` ⚠️ (43 tests) — orchestrator+planner; missing: tool-impls/, approval-flow.ts, error-recovery.ts
- Slice 13: `ai/review/` ⚠️ (25 tests) — engine+chunker; missing: review-submitter.ts
- Slice 14: `extensions/` ⚠️ (34 tests) — manifest+registry; missing: extension-api-impl.ts
