# Development Guide

## Prerequisites

- GNOME Shell 49 development environment (Wayland session)
- TypeScript compiler (`tsc`) installed system-wide (v5.0+)
- `glib-compile-schemas` (part of `libglib2.0-dev` / `glib2-devel`)
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
| `make dev` | Build + install + launch a nested Wayland GNOME Shell session |
| `make pack` | Build + zip for distribution |
| `make clean` | Remove `dist/`, zip, compiled schemas |

## Development workflow

1. **Edit** source in `src/`
2. **`make check`** — catch type errors early (fast, no build output)
3. **`make dev`** — launches a nested GNOME Shell; enable the extension:
   ```sh
   gnome-extensions enable kodecanter@kirushik.github.io
   ```
4. Open Zed inside the nested session, switch projects, verify decorations
5. Watch logs: `journalctl -f -o cat /usr/bin/gnome-shell | grep Kodecanter`

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

Manual testing uses `make dev` which launches a nested GNOME Shell session.

## GNOME 49 API notes

- `Mtk.Rectangle`, not `Meta.Rectangle` (removed in GNOME 47)
- `global.compositor.get_window_actors()`, not `global.get_window_actors()` (moved in GNOME 48)
- Wayland-only — no X11 APIs
