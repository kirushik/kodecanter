# Session: Scale-Aware Frame Effect for Thumbnail Previews

**Date:** 2026-02-15

## What was built

Added a `Clutter.Effect` subclass (`ScaleAwareFrameEffect`) that draws a scale-compensated colored border around Zed windows when they are painted at small scale — workspace thumbnail sidebar, Dash to Dock "all windows" previews, and similar clone-based contexts.

The existing decorations (CSS border via `St.Bin`, badge via `St.Label`) are added as children of `Meta.WindowActor` and propagate through `Clutter.Clone` automatically, but become invisible at small scales (~5-25%) due to antialiasing. The new effect detects the paint scale from the modelview matrix and draws a thick border that appears as a fixed 4px frame on screen regardless of zoom level.

## Key decisions

- **`Clutter.Effect` over overview hooks**: Rather than monkey-patching GNOME Shell's `WorkspaceThumbnail` internals, the effect lives on the `Meta.WindowActor` itself. It fires during every paint (including clone paints), detects scale, and conditionally draws. This works for all clone contexts without depending on GNOME Shell internal class structure.

- **Scale threshold of 0.4**: Below this, the effect draws. Above, it's silent (existing decorations handle it). This separates workspace thumbnails (~0.05-0.15) and dock previews (~0.15-0.25) from the main overview (~0.5-0.7). May need tuning after visual testing.

- **Tied to `border-enabled` setting**: The frame effect shares the border toggle rather than adding its own setting, keeping the preferences UI simple.

- **`Clutter.ColorNode` for drawing**: Uses the paint node API (`ColorNode.new(color)` + `add_rectangle()` x4) rather than direct Cogl framebuffer drawing. This is the modern Clutter way.

## New files

- `src/scaleAwareFrameEffect.ts` — The effect implementation

## Modified files

- `src/decorationManager.ts` — `frameEffect` added to `WindowDecoration`, wired into create/update/remove/fullscreen lifecycle
- `src/constants.ts` — Added `SCALE_THRESHOLD` (0.4) and `THUMBNAIL_BORDER_PX` (4)
- `ambient.d.ts` — Added `graphene-1.0` ambient import
- `tsconfig.json` — Registered new source file

## What's not done yet

- **Visual testing**: `make check` passes, but the effect hasn't been tested in a live GNOME Shell session yet. The scale threshold and border width may need tuning.
- **Fallback strategies**: If `get_modelview_matrix().get_x_scale()` doesn't reflect clone transforms as expected, fallbacks include comparing allocation vs paint area dimensions, or direct `Cogl.Framebuffer.draw_rectangle()`.
- **Separate settings toggle**: Currently coupled to `border-enabled`. Could add `thumbnail-border-enabled` and `thumbnail-border-width` settings later if users want independent control.

## Verification status

- `make check`: PASS
- `make dev` / live testing: NOT YET DONE
