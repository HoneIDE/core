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
└── (future modules...)

tests/
├── workspace.test.ts
├── file-index.test.ts
├── file-watcher.test.ts
└── settings.test.ts
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

See `../INTEGRATED_PLAN.md` for the full feature roadmap. Each slice maps to a directory:
- Slice 1: `workspace/` ✅
- Slice 2: `settings/` ✅
- Slice 4: `git/` 🔜
- Slice 5: `search/` 🔜
- Slice 6: `protocols/lsp/` 🔜
- Slice 7: `protocols/dap/` 🔜
- Slice 8: `ai/provider/` 🔜
- Slice 9: `ai/inline/` 🔜
- Slice 10: `ai/chat/` 🔜
- Slice 12: `ai/agent/` 🔜
- Slice 13: `ai/review/` 🔜
- Slice 14: `extensions/` 🔜
