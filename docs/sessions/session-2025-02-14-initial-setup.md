# Engineering Session: Initial Project Setup

**Date:** 2025-02-14
**Goal:** Create the Kodecanter GNOME Shell 49 extension project from scratch, based on three design documents (`early design drafts.md`, `architecture.md`, `setup-guide.md`).

---

## What Was Built

A fully type-checking, building GNOME Shell 49 extension project with 8 TypeScript source files, a GSettings schema, a Makefile-based build system, and git-submodule-based type definitions (no npm).

### Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/constants.ts` | ~15 | Pure data: WM_CLASS patterns, em-dash, effect names, defaults. No `gi://` imports. |
| `src/colorResolver.ts` | ~70 | DJB2 hash → golden-ratio hue → HSL → hex/RGBA. `getColorForProject()` checks override map first. No `gi://` imports — fully testable in Node. |
| `src/windowTracker.ts` | ~155 | `parseZedTitle()` (pure, exported) + `WindowTracker` class. Connects `window-created` on display, per-window `notify::title`/`size-changed`/`notify::fullscreen`/`unmanaging`. Handles delayed WM_CLASS via `GLib.idle_add`. |
| `src/borderEffect.ts` | ~115 | `Clutter.ShaderEffect` subclass with GLSL SDF rounded-rectangle border. Uniforms: `border_color`, `border_width`, `border_radius`, `size`. Anti-aliased via `smoothstep`. |
| `src/overlayEffect.ts` | ~65 | `Clutter.ShaderEffect` subclass blending a semi-transparent color over the window texture. Single uniform: `overlay_color`. |
| `src/decorationManager.ts` | ~195 | Central orchestrator. Creates/updates/removes border effects, overlay effects, and `St.Label` badges per `Meta.Window`. Reads GSettings, reacts to `changed` signal. Hides decorations during fullscreen. |
| `src/extension.ts` | ~50 | `Extension` subclass. `enable()` wires `WindowTracker` callbacks to `DecorationManager`. `disable()` tears down everything. |
| `src/prefs.ts` | ~175 | `ExtensionPreferences` subclass. Two libadwaita pages: General (toggle switches + spin rows for appearance) and Color Overrides (dynamic list with `Gtk.ColorDialogButton` + add/remove). |

### Config & Build Files

| File | Purpose |
|------|---------|
| `metadata.json` | UUID `kodecanter@kirushik.github.io`, targets `shell-version: ["49"]` |
| `schemas/org.gnome.shell.extensions.kodecanter.gschema.xml` | 7 keys: `border-enabled`, `badge-enabled`, `overlay-enabled`, `border-width`, `border-radius`, `overlay-opacity`, `color-overrides` |
| `stylesheet.css` | `.kodecanter-badge` style class |
| `Makefile` | Targets: `check`, `build`, `install`, `dev`, `pack`, `clean`. Uses system `tsc` directly. |
| `tsconfig.json` | `ES2022` target, `bundler` module resolution, `paths` for `@girs/*` and `resource://` |
| `ambient.d.ts` | Imports `gi://` ambient declarations from `@girs` packages |
| `package.json` | Minimal — name and type only, no dependencies |
| `.gitignore` | `dist/`, `*.zip`, `schemas/gschemas.compiled` |
| `CLAUDE.md` | Project instructions for Claude Code |

---

## Key Decisions & Deviations from Design Docs

### 1. No npm — git submodules for types

The setup guide prescribed `npm install` with `@girs/gnome-shell` and `@girs/gjs` as devDependencies. The user requested avoiding Node.js and `node_modules` entirely.

**Solution:** Two git submodules:
- `types/girs/` → `github.com/gjsify/types` (GObject Introspection types — 42 packages transitively needed)
- `types/gnome-shell/` → `github.com/gjsify/gnome-shell` (GNOME Shell extension types)

`tsconfig.json` uses a wildcard `paths` entry `"@girs/*": ["./types/girs/*"]` to resolve all `@girs/*` imports to the local submodule.

### 2. Local type shims instead of direct gnome-shell submodule references

**Problem discovered:** The gnome-shell types repo has `.ts` files (not `.d.ts`) in `src/types/` that import `@girs/gio-2.0`. With `moduleResolution: "bundler"` in tsc 5.0, resolving `@girs/gio-2.0` from a `.ts` file picked up the package's `main` field (`gio-2.0.js`) instead of the `exports["."].types` field (`index.d.ts`), causing TS7016 "implicit any" errors. `skipLibCheck` doesn't apply to `.ts` files, only `.d.ts`.

**Solution:** Created `types/local/extension.d.ts` and `types/local/prefs.d.ts` — hand-maintained `.d.ts` files extracted from the gnome-shell submodule source. These declare `Extension`, `ExtensionBase`, `ExtensionPreferences`, `InjectionManager`, and `TranslationFunctions` without the problematic import chain.

The `global` object type (`types/gnome-shell/.../global.d.ts`) worked fine via direct `include` in tsconfig because it only imports `@girs/shell-17` and `@girs/clutter-17` which resolve cleanly.

### 3. `resource://` paths resolved via tsconfig `paths`, not `declare module`

**Problem discovered:** TypeScript 5.0 with `moduleResolution: "bundler"` does not check ambient `declare module` declarations for `resource://` URL specifiers — it tries file-based resolution first, fails to find a file, and reports TS2307.

**Solution:** Added explicit `paths` entries in tsconfig:
```json
"resource:///org/gnome/shell/extensions/extension.js": ["./types/local/extension.d.ts"],
"resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js": ["./types/local/prefs.d.ts"]
```

### 4. GLSL SDF shader for rounded borders (not Cogl pipeline rectangles)

The design drafts recommended `Clutter.Effect` with `vfunc_paint` drawing four Cogl pipeline rectangles. This produces square borders which conflict with the user's rounded-corner DE theme.

**Solution:** `Clutter.ShaderEffect` with a GLSL fragment shader computing a signed distance field (SDF) for a rounded rectangle. The shader handles:
- Outer edge: `roundedRectSDF(p, halfSize, border_radius)`
- Inner edge: `roundedRectSDF(p, halfSize - border_width, max(border_radius - border_width, 0))`
- Anti-aliased transitions via `smoothstep`
- Compositing over the offscreen texture from `cogl_sampler_in[0]`

This approach is proven in the Rounded Window Corners extension and runs efficiently on the GPU.

### 5. `GObject.registerClass` type workaround

**Problem:** `GObject.registerClass` returns a GObject-compatible class but TypeScript loses the parent class's method types on `this`. Calling `this.set_shader_source()` inside a class extending `Clutter.ShaderEffect` fails with TS2339.

**Solution:** Define an intersection type alias and cast `this`:
```typescript
type ShaderEffectThis = Clutter.ShaderEffect & BorderEffectPrivate;
// ...
(this as ShaderEffectThis).set_shader_source(BORDER_SHADER);
```

This is documented in CLAUDE.md as a pattern to follow for all `GObject.registerClass` subclasses.

### 6. `ES2022` target instead of `ES2023`

The system `tsc` is version 5.0.4 which doesn't support `ES2023` as a target. Changed to `ES2022`.

### 7. `moduleResolution: "bundler"` instead of `"NodeNext"`

Needed for the `paths` wildcard to work with bare `@girs/*` specifiers and `resource://` URLs. `"NodeNext"` would require stricter resolution rules that conflict with our submodule layout.

### 8. All three decoration types from the start

The setup guide suggested deferring overlay implementation. After discussing complexity (overlay is ~30 extra lines, negligible performance cost), all three were included:
- **Borders:** GLSL SDF rounded-rect shader effect
- **Badges:** `St.Label` as `WindowActor` child, positioned at top-right
- **Overlay:** GLSL mix shader effect with configurable opacity

---

## What's Not Done Yet

1. **Unit tests** — `tests/colorResolver.test.ts` and `tests/titleParser.test.ts` are planned but not created. Need to decide on test runner since vitest requires npm. Alternatives: plain Node.js `assert`, or `gjs` test runner.

2. **Manual testing** — `make dev` has not been run yet. The extension builds but hasn't been tested in a nested GNOME Shell session.

3. **`connectObject`/`disconnectObject`** — The CLAUDE.md specifies using these for signal lifecycle, but `windowTracker.ts` currently uses bare `connect()`. The `connectObject` augmentation is available from the `global.d.ts` type augmentation but would require refactoring signal management.

4. **`resource:///org/gnome/shell/ui/main.js`** — Still points to the gnome-shell submodule source (not a local shim). `extension.ts` doesn't currently import `Main` but `decorationManager.ts` or future code might need it. The resolution chain from `ui/main.d.ts` may pull in the same `.ts` file problem if those types reference `extension-metadata.ts`.

5. **Git commit** — No initial commit has been made.

---

## File Dependency Graph

```
extension.ts
├── windowTracker.ts
│   └── constants.ts
├── decorationManager.ts
│   ├── borderEffect.ts (Clutter.ShaderEffect)
│   ├── overlayEffect.ts (Clutter.ShaderEffect)
│   ├── colorResolver.ts
│   │   └── constants.ts
│   └── constants.ts
└── constants.ts

prefs.ts (standalone, shares GSettings schema)

ambient.d.ts (included by all via tsconfig)
├── @girs/gjs, @girs/gjs/dom
├── @girs/{glib,gobject,gio,clutter,cogl,st,meta,mtk,shell,adw,gtk,gdk}-*-ambient
└── types/gnome-shell/.../global.d.ts (via tsconfig include)

tsconfig.json paths:
├── resource:///...extension.js → types/local/extension.d.ts
├── resource:///...prefs.js → types/local/prefs.d.ts
└── @girs/* → types/girs/* (wildcard)
```

---

## Verified Working State

```
$ tsc --noEmit    # PASS — zero errors
$ make build      # PASS — dist/ contains 8 .js files + metadata + schemas + stylesheet
$ ls dist/
borderEffect.js  colorResolver.js  constants.js  decorationManager.js
extension.js     metadata.json     overlayEffect.js  prefs.js
schemas/         stylesheet.css    windowTracker.js
```

Emitted JS correctly preserves `gi://` and `resource:///` import specifiers (verified by inspection).
