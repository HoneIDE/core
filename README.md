# @honeide/core

Headless services for [Hone IDE](https://github.com/HoneIDE/ide) — workspace management, settings, keybindings, git, search, AI providers, LSP/DAP protocols, and more.

**No UI. No native dependencies. Pure TypeScript.**
Runs in any environment: IDE process, test runner, language server, CI.

---

## What's inside

| Module | Status | Description |
|--------|--------|-------------|
| `workspace/` | ✅ | Multi-root workspace, file watcher, fuzzy file index |
| `settings/` | ✅ | Layered settings store (default → user → workspace → language), keybinding resolver with chord + when-clause support |
| `git/` | 🔜 | Git client, status/diff/blame/log parsers, GitHub/GitLab/Bitbucket API |
| `search/` | 🔜 | Ripgrep integration, search model |
| `protocols/lsp/` | 🔜 | Full LSP 3.17 JSON-RPC client |
| `protocols/dap/` | 🔜 | Debug Adapter Protocol client |
| `ai/provider/` | 🔜 | 8 AI provider adapters (Anthropic, OpenAI, Google, Ollama, Bedrock, Vertex, Azure, OpenAI-compat) |
| `ai/inline/` | 🔜 | Inline completion: FIM formatting, debouncer, LRU cache |
| `ai/chat/` | 🔜 | Chat model, context collector, streaming renderer |
| `ai/agent/` | 🔜 | Autonomous agent: orchestrator, 15+ tools, approval flow |
| `ai/review/` | 🔜 | AI PR review engine |
| `extensions/` | 🔜 | Extension host, API bridge, manifest parser |

## Getting started

```bash
bun install
bun test
```

## Architecture

Each module is a headless service with a clean TypeScript API. Services are consumed by the IDE shell (`@honeide/ide`) and can be used standalone in scripts or extensions.

```
@honeide/core
├── src/
│   ├── workspace/     # FileIndex, FileWatcher, Workspace
│   ├── settings/      # SettingsStore, KeybindingResolver, schema
│   ├── git/           # (coming: GitClient, DiffParser, ...)
│   ├── search/        # (coming: Ripgrep, SearchModel)
│   ├── protocols/     # (coming: LSP, DAP clients)
│   ├── ai/            # (coming: providers, chat, agent)
│   └── extensions/    # (coming: ExtensionHost)
└── tests/
    ├── workspace.test.ts
    ├── settings.test.ts
    └── ...
```

## Design principles

- **Zero UI dependencies** — no DOM, no native calls, no platform assumptions
- **Fully tested** — every module has unit tests; run with `bun test`
- **Protocol-first** — LSP, DAP, and AI providers follow open standards
- **Layered settings** — user → workspace → language priority, VS Code-compatible schema
- **Extension-ready** — services expose the same API surface as `@honeide/api`

## Testing

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun run typecheck     # TypeScript type check
```

## License

MIT
