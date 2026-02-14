# Zed Codebase Decorator: Project Setup & Development Guide

## 1. Yes, Use TypeScript

TypeScript is the right call for this project, and the ecosystem has matured significantly since GNOME 45 introduced ES modules. Here's why:

**The `@girs/gnome-shell` package** provides TypeScript type definitions for the entire GNOME Shell API surface — `Meta.Window`, `Clutter.Effect`, `St.Widget`, `GLib`, `Gio`, and the GNOME Shell internal JS modules like `Main`, `altTab`, `windowPreview`, etc. These are generated from GObject introspection (`.gir`) files via `ts-for-gir`, plus hand-written definitions for GNOME Shell's JS layer. This gives you autocomplete, go-to-definition, and compile-time error checking on every `Meta.Window.get_title()`, `Clutter.Actor.add_child()`, etc.

**No bundler needed.** Plain `tsc` is sufficient. GNOME Shell's ESM runtime expects individual `.js` files with `gi://` and `resource://` import paths — exactly what TypeScript emits. You don't need Rollup, esbuild, or webpack. The official gjs.guide TypeScript page confirms this approach and Tiling Shell (the most complex TypeScript GNOME extension, ~5k stars) uses the same `tsc`-only pipeline.

**One caveat:** the `@girs` type definitions are "experimental" — they cover ~95% of what you need but you'll occasionally hit missing or incorrect types. Use `// @ts-expect-error` or local `.d.ts` patches sparingly for those cases.

---

## 2. Project Directory Structure

```
zed-codebase-decorator/
├── CLAUDE.md                          # Claude Code project instructions
├── .claude/
│   ├── settings.json                  # Permission allowlists, hooks
│   └── commands/
│       ├── dev.md                     # /dev — build + install + launch nested session
│       ├── test.md                    # /test — run all checks
│       └── logs.md                    # /logs — tail gnome-shell logs filtered to our UUID
├── src/
│   ├── extension.ts                   # Main Extension class (enable/disable lifecycle)
│   ├── prefs.ts                       # Preferences UI (ExtensionPreferences + Adw widgets)
│   ├── windowTracker.ts               # Window lifecycle: creation, title changes, destruction
│   ├── decorationManager.ts           # Creates/updates/destroys border effects + badges
│   ├── borderEffect.ts                # Custom Clutter.Effect subclass (Cogl pipeline border)
│   ├── colorResolver.ts               # Hash-to-hue + GSettings override lookup
│   └── constants.ts                   # WM_CLASS patterns, default border width, etc.
├── schemas/
│   └── org.gnome.shell.extensions.zed-codebase-decorator.gschema.xml
├── metadata.json
├── stylesheet.css                     # St.Label badge styles
├── ambient.d.ts                       # Ambient type imports for @girs
├── tsconfig.json
├── package.json
├── Makefile                           # Build, install, dev-session, pack targets
├── .gitignore
└── tests/
    ├── colorResolver.test.ts          # Unit tests for pure logic (runs in Node)
    └── titleParser.test.ts            # Unit tests for title parsing
```

**Why this layout?** The `src/` directory contains TypeScript source that compiles to `dist/`. The `schemas/`, `metadata.json`, and `stylesheet.css` are static assets copied into `dist/` at build time. Tests live in `tests/` and run under Node.js (not GJS) — more on this below.

---

## 3. Key Configuration Files

### `metadata.json`

```json
{
    "uuid": "zed-codebase-decorator@your.github.username",
    "name": "Zed Codebase Decorator",
    "description": "Colors Zed editor windows by project for instant visual identification",
    "shell-version": ["49"],
    "url": "https://github.com/yourname/zed-codebase-decorator",
    "settings-schema": "org.gnome.shell.extensions.zed-codebase-decorator"
}
```

### `package.json`

```json
{
    "name": "zed-codebase-decorator",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
        "build": "tsc",
        "check": "tsc --noEmit",
        "test": "node --experimental-vm-modules node_modules/.bin/vitest run",
        "test:watch": "node --experimental-vm-modules node_modules/.bin/vitest"
    },
    "devDependencies": {
        "typescript": "^5.7",
        "vitest": "^3.0",
        "@girs/gjs": "^4.0",
        "@girs/gnome-shell": "^49.0"
    },
    "dependencies": {}
}
```

Note: `@girs/gnome-shell` and `@girs/gjs` are **dev-only** — they provide types at compile time but are never bundled into the extension. The GNOME Shell runtime provides the actual implementations.

### `tsconfig.json`

```json
{
    "compilerOptions": {
        "target": "ES2023",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "outDir": "./dist",
        "rootDir": "./src",
        "sourceMap": false,
        "strict": true,
        "skipLibCheck": true,
        "noEmit": false,
        "declaration": false,
        "lib": ["ES2023"]
    },
    "include": ["ambient.d.ts"],
    "files": [
        "src/extension.ts",
        "src/prefs.ts",
        "src/windowTracker.ts",
        "src/decorationManager.ts",
        "src/borderEffect.ts",
        "src/colorResolver.ts",
        "src/constants.ts"
    ]
}
```

### `ambient.d.ts`

```typescript
import "@girs/gjs";
import "@girs/gjs/dom";
import "@girs/gnome-shell/ambient";
import "@girs/gnome-shell/extensions/global";
```

This file makes `gi://Meta`, `resource:///org/gnome/shell/...`, and the `global` object (with `global.display`, `global.window_group`, etc.) available to TypeScript without prefixing everything with `@girs/`.

### `Makefile`

```makefile
UUID = zed-codebase-decorator@your.github.username
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all build install dev pack clean test check

all: build

# ── Build ────────────────────────────────────────
build: node_modules dist/extension.js schemas/gschemas.compiled
	@cp metadata.json dist/
	@cp stylesheet.css dist/
	@cp -r schemas dist/

node_modules: package.json
	npm install
	@touch node_modules

dist/extension.js: node_modules $(wildcard src/*.ts)
	npm run build

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas

# ── Type checking ────────────────────────────────
check: node_modules
	npm run check

# ── Tests ────────────────────────────────────────
test: node_modules
	npm run test

# ── Install to local extensions dir ──────────────
install: build
	@mkdir -p $(INSTALL_DIR)
	@cp -r dist/* $(INSTALL_DIR)/

# ── Launch nested Wayland session for testing ────
dev: install
	dbus-run-session -- env \
		MUTTER_DEBUG_NUM_DUMMY_MONITORS=1 \
		MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 \
		gnome-shell --nested --wayland

# ── Package for distribution ─────────────────────
pack: build
	@(cd dist && zip -qr ../$(UUID).zip *)

# ── Cleanup ──────────────────────────────────────
clean:
	rm -rf dist node_modules $(UUID).zip schemas/gschemas.compiled
```

### `.gitignore`

```
dist/
node_modules/
*.zip
schemas/gschemas.compiled
```

---

## 4. Testing Strategy

### Unit tests (pure logic, runs in Node.js with Vitest)

Some of your logic is completely decoupled from the GNOME Shell runtime and can be tested with standard Node.js tools. These are fast, deterministic, and can run in CI:

```typescript
// tests/colorResolver.test.ts
import { describe, it, expect } from 'vitest';

// Import only the pure functions — NOT anything from gi://
// This means colorResolver.ts should export pure functions separately
import { hashString, hueFromProjectName, hslToHex } from '../src/colorResolver.js';

describe('color resolution', () => {
    it('produces deterministic hue for the same project name', () => {
        const a = hueFromProjectName('my-app');
        const b = hueFromProjectName('my-app');
        expect(a).toBe(b);
    });

    it('produces different hues for different projects', () => {
        const a = hueFromProjectName('frontend');
        const b = hueFromProjectName('backend');
        expect(a).not.toBe(b);
    });

    it('generates valid hex colors', () => {
        const hex = hslToHex(180, 70, 50);
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });
});
```

```typescript
// tests/titleParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseZedTitle } from '../src/windowTracker.js';

describe('Zed title parsing', () => {
    it('extracts project name from standard title', () => {
        expect(parseZedTitle('main.rs — my-app')).toBe('my-app');
    });

    it('handles title with multiple em-dashes', () => {
        expect(parseZedTitle('file.ts — some — project')).toBe('project');
    });

    it('returns null for welcome screen', () => {
        expect(parseZedTitle('Zed')).toBeNull();
    });

    it('returns null for null/empty title', () => {
        expect(parseZedTitle(null)).toBeNull();
        expect(parseZedTitle('')).toBeNull();
    });
});
```

**The key design principle:** separate pure logic (title parsing, color hashing, settings lookup) from GNOME Shell API calls (Meta.Window, Clutter.Effect, St.Widget). Export the pure functions for testing; keep the side-effectful code in thin wrapper modules.

### Manual testing (nested Wayland session)

This is your primary integration testing method. GNOME Shell supports running a nested instance in a window on Wayland:

```bash
# One-command cycle: build → install → launch nested shell
make dev
```

This runs `dbus-run-session -- gnome-shell --nested --wayland` which opens a GNOME Shell in a window. Inside it:

1. Open a terminal (the nested shell has its own session)
2. Enable the extension: `gnome-extensions enable zed-codebase-decorator@your.github.username`
3. Open Zed (if it's installed in the nested session — or test with any other app first)
4. Check borders appear, change projects, verify color changes

**Important limitation:** the nested session has its own D-Bus, so apps from your main session won't appear. You'll either need to launch Zed inside the nested session or initially test with other multi-window apps (like multiple GNOME Terminal windows with different titles).

**Log monitoring** — tail the journal filtered to your extension:

```bash
# In a separate terminal (outside the nested session)
journalctl -f -o cat /usr/bin/gnome-shell 2>&1 | grep -i 'zed-codebase-decorator'

# Or inside Looking Glass (Alt+F2 → "lg" inside nested session)
```

### Smoke-test script (for CI or quick validation)

```bash
#!/bin/bash
# scripts/smoke-test.sh — validates the extension loads without errors
set -e

make build
make install

# Start nested shell in background, wait for it, then check for errors
timeout 10 dbus-run-session -- gnome-shell --nested --wayland &
SHELL_PID=$!
sleep 5

# Enable extension
dbus-run-session -- gnome-extensions enable "$UUID" 2>&1

# Check for errors in journal
if journalctl --user -b --no-pager | grep -q "error.*zed-codebase-decorator"; then
    echo "FAIL: Extension errors detected"
    kill $SHELL_PID 2>/dev/null
    exit 1
fi

kill $SHELL_PID 2>/dev/null
echo "PASS: Extension loaded without errors"
```

---

## 5. Claude Code Configuration

### `CLAUDE.md` (project root)

This is the most important file for maximizing Claude Code's effectiveness. Keep it focused and practical:

```markdown
# Zed Codebase Decorator — GNOME Shell Extension

## What this is
A GNOME Shell 49 extension that visually decorates Zed editor windows with
per-codebase colors (colored borders + project name badges). Written in
TypeScript, targeting Ubuntu 25.10 (Wayland-only, GNOME 49).

## Tech stack
- TypeScript compiled with `tsc` to ES modules (no bundler)
- GNOME Shell extension API: Meta, St, Clutter, Cogl, GLib, Gio, Mtk
- Type definitions: `@girs/gjs` and `@girs/gnome-shell` (dev-only)
- Testing: Vitest for unit tests on pure logic
- Build: Makefile wrapping npm scripts

## Commands
- `make build` — compile TypeScript + schemas, assemble dist/
- `make check` — type-check without emitting
- `make test` — run Vitest unit tests
- `make install` — copy to ~/.local/share/gnome-shell/extensions/
- `make dev` — build + install + launch nested Wayland gnome-shell
- `make pack` — create .zip for distribution

## Architecture
- `src/extension.ts` — Extension class, enable/disable lifecycle, signal wiring
- `src/windowTracker.ts` — Monitors Meta.Window creation/title/destruction for Zed windows
- `src/decorationManager.ts` — Creates/manages border effects and badge actors per window
- `src/borderEffect.ts` — Custom Clutter.Effect subclass drawing Cogl pipeline borders
- `src/colorResolver.ts` — Deterministic hash-to-color + GSettings override lookup
- `src/prefs.ts` — Adw preferences UI (toggle decorations, color overrides)
- `src/constants.ts` — WM_CLASS patterns, defaults

## GNOME 49-specific rules (IMPORTANT)
- Use `Mtk.Rectangle` NOT `Meta.Rectangle` (removed in GNOME 49)
- Use `global.compositor.get_window_actors()` NOT `global.get_window_actors()` (moved in 48)
- Import Mtk: `import Mtk from 'gi://Mtk'`
- Wayland-only: no X11 fallbacks, no xprop, no xdotool
- ESM format: all imports use `gi://` URIs and `resource:///` paths
- Window rects: always use `get_frame_rect()` not `get_buffer_rect()`

## Code style
- Strict TypeScript, minimize `any` and `@ts-expect-error`
- Use `connectObject()`/`disconnectObject()` for signal lifecycle where available
- Separate pure functions (testable) from GNOME Shell API calls
- Export pure functions from modules for unit testing
- Use `console.log()` / `console.warn()` / `console.error()` for logging
- Prefix log messages with `[ZedDecorator]`

## How to verify changes
1. `make check` — must pass with no type errors
2. `make test` — unit tests must pass
3. `make dev` — visually verify in nested session

## Known constraints
- Zed title format: `{filename} — {project_basename}` (em-dash U+2014)
- Zed uses single process — /proc/PID/cwd is useless for per-window identification
- Same-named project directories get the same auto-color (limitation of basename-only)
- Title may be null briefly after window creation — defer until notify::title fires

@docs/architecture.md
```

### `.claude/settings.json`

```json
{
    "permissions": {
        "allow": [
            "Bash(make:*)",
            "Bash(npm:*)",
            "Bash(npx:*)",
            "Bash(glib-compile-schemas:*)",
            "Bash(gnome-extensions:*)",
            "Bash(dbus-run-session:*)",
            "Bash(journalctl:*)",
            "Bash(cat:*)",
            "Bash(ls:*)",
            "Bash(grep:*)"
        ]
    }
}
```

### `.claude/commands/dev.md`

```markdown
Build, install, and launch a nested GNOME Shell session for testing:

1. Run `make dev`
2. Inside the nested shell, enable the extension with:
   `gnome-extensions enable zed-codebase-decorator@your.github.username`
3. Report what you see in the journal logs
```

### `.claude/commands/test.md`

```markdown
Run all verification steps:

1. `make check` — TypeScript type checking
2. `make test` — Vitest unit tests
3. Report results
```

### `.claude/skills/gnome-extension/SKILL.md` (optional but high-value)

You can create a skill file with condensed GNOME Shell API patterns that Claude Code can reference. This would include the signal patterns, `Clutter.Effect` template, `Meta.Window` API surface, and the GNOME 49 migration notes from the architecture doc.

---

## 6. Development Workflow

### Initial setup

```bash
# Clone and set up
git init zed-codebase-decorator
cd zed-codebase-decorator

# Create the directory structure
mkdir -p src schemas tests .claude/commands

# Initialize npm and install deps
npm init -y
npm install --save-dev typescript vitest @girs/gjs @girs/gnome-shell

# Create all config files (metadata.json, tsconfig.json, Makefile, etc.)
# Then:
make build
```

### Iteration cycle

```
Edit src/*.ts  →  make check  →  make test  →  make dev  →  observe  →  repeat
```

The nested session takes ~3-5 seconds to launch. Close it (Ctrl+C or close window), make changes, run `make dev` again. There's no hot-reload for GNOME Shell extensions — each change requires a fresh nested session.

### Debugging tips

1. **Looking Glass** (Alt+F2 → type `lg` → Enter inside nested session): interactive JS console connected to the shell. You can inspect `global.get_window_actors()`, test your title parser live, check if effects are attached.

2. **`SHELL_DEBUG` env var**: set `SHELL_DEBUG=all` before the nested session for verbose stack traces on warnings/errors.

3. **Journal logs**: `console.log('[ZedDecorator] ...')` from extension.ts shows up in `journalctl -f /usr/bin/gnome-shell`.

4. **Prefs testing**: preferences can be tested without a nested session: `gnome-extensions prefs zed-codebase-decorator@your.github.username` opens the prefs window in your main session (as a separate GTK4 process).

---

## 7. Why Not [Alternative]?

**Why not plain JavaScript?** You lose autocomplete on the GNOME Shell API, which is enormous and poorly documented. Type errors in signal callback signatures or `get_frame_rect()` return types are caught at compile time instead of crashing your desktop at runtime.

**Why not Rollup/esbuild?** GNOME Shell's ESM loader expects `gi://` and `resource:///` import specifiers to be preserved verbatim. Bundlers would try to resolve or rewrite them. `tsc` emits them unchanged. The official gjs.guide TypeScript page uses `tsc` only, and so does Tiling Shell (the largest TypeScript GNOME extension).

**Why not a test runner that runs under GJS?** GJS has no test framework ecosystem. The GJS REPL can execute snippets, but there's no Vitest/Jest equivalent. The practical approach is to test pure logic under Node.js and test GNOME Shell integration manually via nested sessions.

**Why not Rollup for multi-file bundling?** GNOME Shell's extension review guidelines actually prefer readable output. Bundled/minified code is harder to review and can be rejected. Individual `.js` files from `tsc` are perfectly readable and match 1:1 with your TypeScript sources.
