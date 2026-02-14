# Architecture Reference — Zed Codebase Decorator

This document is referenced by CLAUDE.md and provides the full technical context
for the extension's architecture. Claude Code reads it automatically when relevant.

## Window Identification

Zed sets its Wayland `xdg_toplevel` title as `{filename} — {project_basename}` where `—`
is U+2014 (em-dash). The WM_CLASS / Wayland `app_id` is `dev.zed.Zed` for all windows.

**Parsing logic:**
```
title.split(' \u2014 ')  →  last segment  →  project name
```

**Edge cases:**
- Title may be null for a few hundred ms after `window-created` — defer via `notify::title`
- Welcome screen, settings: title may be just "Zed" → return null
- Multiple project folders in one workspace: only first folder's name appears

## Signal Architecture

### Display-level (connect in enable(), disconnect in disable())
| Signal | Source | Purpose |
|--------|--------|---------|
| `window-created` | `global.display` | Detect new Zed windows |
| `restacked` | `global.display` | Re-order border overlays if using sibling approach |
| `notify::focus-window` | `global.display` | Optional: highlight focused window border |

### Per-window (connect per tracked window, disconnect on unmanaging)
| Signal | Source | Purpose |
|--------|--------|---------|
| `notify::title` | `Meta.Window` | Detect project/file changes, reparse |
| `size-changed` | `Meta.Window` | Reposition badge actor |
| `notify::minimized` | `Meta.Window` | Hide/show decorations |
| `notify::fullscreen` | `Meta.Window` | Hide decorations in fullscreen |
| `unmanaging` | `Meta.Window` | Cleanup: remove effect, destroy badge, disconnect signals |

## Decoration Approach

### Borders: Clutter.Effect on WindowActor (primary approach)
Attach a custom `Clutter.Effect` subclass to `Meta.WindowActor` via
`windowActor.add_effect_with_name('zed-border', effect)`. The effect's
`vfunc_paint()` draws four rectangles via `Cogl.Pipeline`. This automatically
propagates through `Clutter.Clone` to Overview, Alt-Tab, workspace thumbnails,
and dock previews.

### Badges: St.Label as WindowActor child
Add `St.Label` via `windowActor.add_child(badge)`. Position at top-right corner.
Reposition on `size-changed`. Also propagates through clones automatically.

### Why not St.Bin sibling in global.window_group?
Requires manual restacking via `restacked` signal, and does NOT propagate to
Clutter.Clone surfaces (Overview, Alt-Tab, dock). Use only as fallback.

## Color Assignment

1. Check GSettings `color-overrides` dictionary (key: project basename, value: hex color)
2. If no override: hash project name → golden ratio hue distribution → HSL(hue, 75%, 50%)

```
hue = (hashString(name) * 137.508) % 360
```

## GNOME 49 API Notes

```javascript
// ✅ Correct for GNOME 49
import Mtk from 'gi://Mtk';
const rect = metaWindow.get_frame_rect();  // returns Mtk.Rectangle

// ❌ Removed in GNOME 49
import Meta from 'gi://Meta';
new Meta.Rectangle();  // DOES NOT EXIST

// ✅ Correct for GNOME 48+
const actors = global.compositor.get_window_actors();

// ❌ Removed in GNOME 48
const actors = global.get_window_actors();
```

## GSettings Schema Keys

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `border-enabled` | `b` | `true` | Show colored borders |
| `badge-enabled` | `b` | `true` | Show project name badges |
| `overlay-enabled` | `b` | `false` | Subtle color tint overlay |
| `border-width` | `i` | `3` | Border thickness in px |
| `border-radius` | `i` | `12` | Border corner radius in px |
| `overlay-opacity` | `i` | `15` | Overlay opacity 0-100 |
| `color-overrides` | `a{ss}` | `{}` | Project name → hex color map |

## File Responsibilities

| File | Depends on GNOME API? | Testable in Node? |
|------|-----------------------|-------------------|
| `constants.ts` | No | Yes |
| `colorResolver.ts` | Partially (GSettings lookup) | Pure functions: yes |
| `windowTracker.ts` | Yes (Meta.Window) | Title parser: yes |
| `borderEffect.ts` | Yes (Clutter.Effect, Cogl) | No |
| `decorationManager.ts` | Yes (St, Clutter, Meta) | No |
| `extension.ts` | Yes (Extension base class) | No |
| `prefs.ts` | Yes (Adw, Gtk) | No |
