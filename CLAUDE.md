# Kodecanter

GNOME Shell 49 extension that decorates Zed editor windows with per-codebase colored borders and badges.

## Stack

TypeScript → `tsc` → ESM. GNOME Shell APIs (Meta, St, Clutter, Cogl, Mtk). No bundler — GNOME's ESM loader needs `gi://` and `resource:///` imports preserved verbatim.

## Type definitions (no npm — git submodules only)

Types come from two git submodules, NOT npm packages:
- `types/girs/` — [gjsify/types](https://github.com/gjsify/types) — GObject Introspection types (Clutter, Meta, St, Cogl, GLib, Gio, etc.)
- `types/gnome-shell/` — [gjsify/gnome-shell](https://github.com/gjsify/gnome-shell) — GNOME Shell extension types (Extension, ExtensionPreferences, global, ui/main)

`tsconfig.json` maps `@girs/*` package names to local submodule paths via a wildcard `paths` entry. Extension API types (`Extension`, `ExtensionPreferences`) live in `types/local/` as hand-maintained `.d.ts` shims (extracted from gjsify/gnome-shell to avoid `.ts`→`.d.ts` resolution issues with tsc 5.0). The `ambient.d.ts` file imports `gi://` ambient module declarations from `@girs` packages. The `global` object type comes from `types/gnome-shell/.../global.d.ts` included via tsconfig `include`. There is no `node_modules/` directory — `tsc` is expected to be installed system-wide.

### GObject.registerClass type pattern
`GObject.registerClass` erases parent class methods on `this`. In effect subclasses, cast `this` through a union type (e.g., `(this as ShaderEffectThis).set_shader_source(...)`) to access inherited methods. See `borderEffect.ts` for the pattern.

## Commands

```
make check      # typecheck only (fast, run after every change)
make build      # tsc + compile schemas + assemble dist/
make dev        # build → install → launch nested Wayland gnome-shell
make pack       # extension .zip for distribution
```

IMPORTANT: always run `make check` before `make dev`.

## Documentation

- [`README.md`](README.md) — user-facing overview, install, settings
- [`DEVELOPMENT.md`](DEVELOPMENT.md) — build commands, project layout, architecture, type system

### `docs/` structure

| Folder | Contents |
|--------|----------|
| `docs/past/` | Superseded design documents — historical reference only. Do not treat as current spec. |
| `docs/future/` | Feature ideas and improvement plans. Add new ideas here. |
| `docs/sessions/` | Engineering session logs (see below). |

### Session logging policy

After any **major coding session** (new features, significant refactors, architectural changes), create a session log at `docs/sessions/session-YYYY-MM-DD-slug.md`. Include: what was built, key decisions, deviations from prior plans, what's not done yet, and verification status. Skip this for minor bugfixes, typo fixes, or non-coding Q&A.

Current session logs:
- [`session-2025-02-14-initial-setup.md`](docs/sessions/session-2025-02-14-initial-setup.md) — project created from scratch

## GNOME 49 rules (CRITICAL — will break the build if violated)

- Use `Mtk.Rectangle`, NOT `Meta.Rectangle` (removed in 47)
- Use `global.compositor.get_window_actors()`, NOT `global.get_window_actors()` (moved in 48)
- Import: `import Mtk from 'gi://Mtk'`
- Wayland-only. No X11 APIs, no `xprop`, no `xdotool`.

## Code style

- Strict TypeScript, no `any`
- `connectObject()` / `disconnectObject()` for all GObject signals — never bare `connect()`
- Keep pure logic (title parsing, color hashing) in separate modules with no GNOME imports so they can be tested in Node
- Prefix console.log with `[Kodecanter]`

## Zed-specific constraints

- Window title format: `{filename} — {project_basename}` (em-dash U+2014)
- Single-process: all windows share PID, WM_CLASS is always `dev.zed.Zed`
- Title may be null for ~200ms after window-created — always defer via `notify::title`

## MCP servers available

- **context7** — look up current library/API docs (GLib, Clutter, St, Meta). Use to look up for example GNOME API. **IMPORTANT**: don't assume you know the API surface — always check the docs for the specific versions of the libraries and frameworks we're using. Context7 is user-submittable: if some library hadn't been found in the docs, escalate to user to add it to Context7's docs collection.
- **mcp-server-fetch** — fetch web pages. Use for reading gjs.guide, GNOME GitLab source, or extension review guidelines.
- **mcp-server-git** — git operations. Use for commits, diffs, branch management.
- **ripgrep** — fast codebase search. Use before reading files to find relevant code quickly.
- **sequential-thinking** — structured multi-step reasoning. Use for architectural decisions or complex debugging.
- **serena** — LSP-powered semantic code navigation (go-to-definition, find-references). Use for understanding type hierarchies and cross-file symbol relationships.
