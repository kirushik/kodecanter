# Development Guide

## Prerequisites

- GNOME Shell 49 development environment (Wayland session)
- TypeScript compiler (`tsc`) installed system-wide (v5.0+)
- `glib-compile-schemas` (part of `libglib2.0-dev` / `glib2-devel`)
- `mutter-devkit` for nested testing sessions (`mutter-dev-bin` on Ubuntu/Debian)
- Git (for submodule checkout)

## Getting started

```sh
git clone --recurse-submodules https://github.com/kirushik/kodecanter.git
cd kodecanter
make check   # verify types resolve
make build   # compile to dist/
```

## Project layout

```
src/                  TypeScript source (compiles to dist/)
  extension.ts        Extension lifecycle (enable/disable)
  prefs.ts            Preferences UI (libadwaita)
  windowTracker.ts    Window creation/title/destruction signals
  decorationManager.ts  Orchestrates borders, badges, overlays per window
  borderEffect.ts     GLSL SDF rounded-rectangle border shader
  overlayEffect.ts    GLSL color overlay shader
  colorResolver.ts    Hash-based color assignment (pure, no gi:// imports)
  constants.ts        Shared constants (pure, no gi:// imports)

schemas/              GSettings schema (compiled at build time)
types/
  girs/               git submodule: @girs type definitions (gjsify/types)
  gnome-shell/        git submodule: GNOME Shell types (gjsify/gnome-shell)
  local/              hand-maintained .d.ts shims for Extension/ExtensionPreferences

docs/
  past/               superseded design documents (historical reference)
  future/             feature ideas and improvement plans
  sessions/           engineering session logs

dist/                 build output (gitignored)
```

## Build commands

| Command | What it does |
|---------|--------------|
| `make check` | Typecheck only — fast, run after every change |
| `make build` | `tsc` + compile GSettings schema + copy assets to `dist/` |
| `make install` | Build + copy `dist/` to `~/.local/share/gnome-shell/extensions/` |
| `make dev` | Build + install + launch a nested GNOME Shell session via `--devkit` |
| `make pack` | Build + zip for distribution |
| `make clean` | Remove `dist/`, zip, compiled schemas |

## Development workflow

### Quick iteration (no logout)

Use `make dev` to test extension loading, preferences UI, and catch JS errors
without disrupting your session:

1. **Edit** source in `src/`
2. **`make check`** — catch type errors early
3. **`make dev`** — launches a nested GNOME Shell via `--devkit`
4. Inside the nested session, enable the extension:
   ```sh
   gnome-extensions enable kodecanter@kirushik.github.io
   ```
5. Verify the extension loads without errors (check the nested shell's log output)
6. Test the preferences UI:
   ```sh
   gnome-extensions prefs kodecanter@kirushik.github.io
   ```

> **Note:** Zed (and most GUI apps) cannot easily run inside the nested session —
> they connect to the parent compositor's Wayland display instead. This is a
> [known limitation](https://discourse.gnome.org/t/launch-application-in-nested-mutter/13733)
> of nested Wayland compositors. `make dev` is for testing shell-side behavior only.

### Full integration testing (requires logout)

To test actual Zed window decorations:

1. **`make check`** — catch type errors
2. **`make install`** — build and copy to `~/.local/share/gnome-shell/extensions/`
3. **Log out and log back in** (required on Wayland for GNOME Shell to reload extensions)
4. Enable the extension if not already enabled:
   ```sh
   gnome-extensions enable kodecanter@kirushik.github.io
   ```
5. Open Zed with a project, verify decorations appear
6. Watch logs:
   ```sh
   journalctl -f -o cat /usr/bin/gnome-shell | grep Kodecanter
   ```

## Type system

Types come from **git submodules**, not npm. There is no `node_modules/` directory.

- `types/girs/` maps to `@girs/*` via a tsconfig `paths` wildcard
- `types/local/extension.d.ts` and `types/local/prefs.d.ts` are hand-maintained shims for `resource:///` extension APIs (needed because the gjsify/gnome-shell `.ts` source files have resolution issues with tsc 5.0 bundler mode)
- `ambient.d.ts` imports all `gi://` ambient declarations
- `types/gnome-shell/.../global.d.ts` provides the `global` object type (included via tsconfig)

See [`docs/sessions/session-2025-02-14-initial-setup.md`](docs/sessions/session-2025-02-14-initial-setup.md) for the full story on why this setup exists and what problems it solves.

## Architecture

### Signal flow

```
global.display 'window-created'
  → WindowTracker checks WM_CLASS (dev.zed.Zed)
    → if title available: parse project name → callback
    → if title null: defer via notify::title
      → on title change: parse → onWindowTracked / onWindowUpdated

Meta.Window 'unmanaging'
  → onWindowLost → DecorationManager.removeDecorations()

Meta.Window 'notify::fullscreen'
  → onWindowFullscreen → hide/show decorations

Meta.Window 'size-changed'
  → onWindowSizeChanged → reposition badge
```

### Decoration types

| Type | Implementation | Attached to |
|------|---------------|-------------|
| Border | `Clutter.ShaderEffect` with GLSL SDF | `Meta.WindowActor` effect |
| Badge | `St.Label` | `Meta.WindowActor` child |
| Overlay | `Clutter.ShaderEffect` with GLSL mix | `Meta.WindowActor` effect |

All three propagate through `Clutter.Clone` (Overview, Alt-Tab, dock previews) automatically.

### Color pipeline

`project name` → DJB2 hash → golden-angle hue distribution → HSL(hue, 75%, 50%) → hex/RGBA

Override map (from GSettings `color-overrides`) is checked first; hash is the fallback.

## Testing

Unit tests for pure modules (`colorResolver.ts`, `parseZedTitle` from `windowTracker.ts`) are planned but not yet implemented. These modules have no `gi://` imports and can run under Node.js.

Manual testing uses two modes: `make dev` for quick shell-side checks (extension loading, prefs UI) and `make install` + logout/login for full integration testing with Zed. See [Development workflow](#development-workflow) above.

## GNOME 49 API notes

- `Mtk.Rectangle`, not `Meta.Rectangle` (removed in GNOME 47)
- `global.compositor.get_window_actors()`, not `global.get_window_actors()` (moved in GNOME 48)
- `Cogl.ShaderType.FRAGMENT`, not `Clutter.ShaderType.FRAGMENT_SHADER` (enum moved from Clutter to Cogl)
- `gnome-shell --devkit`, not `gnome-shell --nested` (removed in GNOME 49; requires `mutter-devkit`)
- Wayland-only — no X11 APIs
