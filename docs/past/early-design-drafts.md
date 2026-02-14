# Architecting a GNOME Shell extension for Zed editor window decoration

**The extension is fully feasible.** Zed's window title contains the project name, GNOME 49's compositor exposes this via `Meta.Window.get_title()`, and decorations added as children of `Meta.WindowActor` propagate automatically through `Clutter.Clone` to every shell UI surface — Activities Overview, Alt-Tab, workspace thumbnails, and dock previews. Ubuntu 25.10 ships **GNOME 49** (Wayland-only, no Xorg session), and the modern ESM extension API provides all the building blocks needed. The primary architectural challenge is that Zed uses a single-process model, making title parsing the only reliable per-window project identification method.

---

## 1. How Zed identifies itself to the window manager

### Window title is the primary identification signal

Zed sets its window title in the format **`{active_filename} — {project_directory_basename}`** using an em-dash (U+2014) as separator. For example, `channel.rs — app` or `Cargo.toml — my-project`. When no file is focused, the title may be just the project directory name. The title is set via GPUI's platform layer (`xdg_toplevel::set_title()` on Wayland, `XChangeProperty` for `_NET_WM_NAME` on X11), with the implementation living in `crates/gpui/src/platform/linux/wayland/` and `crates/gpui/src/platform/linux/x11/`.

**The WM_CLASS / Wayland `app_id`** is `dev.zed.Zed` for all windows — it identifies the application but cannot distinguish projects. This was fixed in PR #10909 after originally being blank on Wayland (issue #9132). The desktop file is `dev.zed.Zed.desktop`.

### Single-process architecture eliminates /proc-based identification

Zed uses a **one process, one socket, many workspaces** model. The CLI binary (`zed` or `zeditor`) is a thin launcher that connects to a Unix domain socket and sends `open_paths` messages to the already-running `zed-editor` process. This means `/proc/PID/cwd` reflects the initial launch directory (not per-window projects), and `/proc/PID/cmdline` for the editor process won't contain individual project paths. The CLI process that received path arguments is short-lived and exits after forwarding.

### Zed runs native Wayland, not XWayland

Zed has its own GPU-accelerated rendering engine (GPUI + `blade-graphics` / Vulkan) with separate native backends for Wayland (`wayland-client` crate) and X11 (`x11rb` crate). It does **not** use GTK, Qt, or any toolkit. On Ubuntu's Wayland session, `xprop` and `xdotool` are irrelevant — all window inspection must happen through `Meta.Window` APIs inside the extension.

### Parsing strategy for project identification

```javascript
function getProjectName(metaWindow) {
    const title = metaWindow.get_title();
    if (!title) return null;
    
    const EM_DASH = '\u2014'; // U+2014
    const parts = title.split(` ${EM_DASH} `);
    
    // Format: "filename — project_name"
    if (parts.length >= 2) return parts[parts.length - 1].trim();
    
    // No separator — could be welcome screen, settings, or bare project
    if (title === 'Zed' || title.startsWith('Welcome')) return null;
    return title.trim();
}
```

**Key limitation:** the title provides only the directory basename (e.g., `app`), not the full path (`/home/user/projects/app`). Two projects with identical directory names will hash to the same color. Issue #14534 (configurable `window.title` pattern) remains open upstream, and if implemented, would allow including the full path. No custom X11 atoms or Wayland protocol extensions are set by Zed.

---

## 2. GNOME 49 extension architecture on Ubuntu 25.10

### Ubuntu 25.10 ships GNOME Shell 49.0

Confirmed from Ubuntu package repositories: `gnome-shell 49.0-1ubuntu1` in the Questing Quokka archive. Ubuntu 25.10 is **Wayland-only** — the Xorg session is removed entirely following GNOME 49's upstream decision, though XWayland remains for legacy apps. The release sequence is: 24.04→GNOME 46, 24.10→47, 25.04→48, **25.10→49**.

GNOME 49-specific changes relevant to this extension: `Meta.Rectangle` is removed (use **`Mtk.Rectangle`** instead), and `Meta.WaylandClient` was redesigned. The ESM extension format and core APIs (`Meta.Window`, `St`, `Clutter`) are stable.

### Extension file structure and ESM format

Since GNOME 45, extensions must use ES modules. The required structure is:

```
zed-decorator@username.github.io/
    extension.js        # Main extension code (Extension class)
    metadata.json       # Extension metadata
    prefs.js            # Preferences UI (ExtensionPreferences class)
    stylesheet.css      # Custom CSS for St widgets
    schemas/            # GSettings schema XML + compiled binary
        org.gnome.shell.extensions.zed-decorator.gschema.xml
        gschemas.compiled
```

The **metadata.json** for GNOME 49:

```json
{
    "uuid": "zed-decorator@username.github.io",
    "name": "Zed Codebase Decorator",
    "description": "Visually decorates Zed editor windows with per-codebase colors",
    "shell-version": ["49"],
    "url": "https://github.com/username/zed-decorator",
    "settings-schema": "org.gnome.shell.extensions.zed-decorator"
}
```

### Core GI imports and GNOME Shell module access

```javascript
// GObject Introspection libraries (gi:// URI scheme)
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';       // Replaces Meta.Rectangle in GNOME 49
import GObject from 'gi://GObject';

// GNOME Shell internal modules (resource:// URI — lowercase path in extension.js)
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
```

### Window event listening and Meta.Window API

The `global.display` object provides the `window-created` signal. `Meta.Window` exposes `get_title()`, `get_wm_class()`, `get_pid()`, and `get_frame_rect()` — all functional on Wayland. Title changes are tracked via the `notify::title` signal. The window's compositor actor is obtained with `get_compositor_private()`, which returns a `Meta.WindowActor` (a `Clutter.Actor` subclass).

**Important timing caveat:** WM_CLASS and title may not be immediately available on `window-created`. Use a short `GLib.timeout_add()` delay of ~200-250ms, or connect to `notify::title` and `notify::wm-class` to react when they become available.

For **GNOME 48+ compatibility**, note that `global.get_window_actors()` moved to `global.compositor.get_window_actors()`:

```javascript
function getWindowActors() {
    if (global.compositor?.get_window_actors)
        return global.compositor.get_window_actors();
    return global.get_window_actors();
}
```

---

## 3. Three visual decoration approaches and their tradeoffs

### Approach A — Clutter.Effect on WindowActor (recommended for overlays and borders)

This approach applies a custom `Clutter.Effect` directly to the `Meta.WindowActor`. The effect's `vfunc_paint()` draws colored rectangles using a `Cogl.Pipeline`. This is the pattern used by **gnome-colored-borders** and GNOME Shell's own `RedBorderEffect` in Looking Glass.

```javascript
const BorderEffect = GObject.registerClass(
class BorderEffect extends Clutter.Effect {
    _init(color, width) {
        super._init();
        this._color = color;  // Cogl.Color
        this._width = width;
        this._pipeline = null;
    }

    vfunc_paint(node, paintContext) {
        // Paint the original window first
        const actor = this.get_actor();
        actor.continue_paint(paintContext);

        if (!this._pipeline) {
            const ctx = paintContext.get_framebuffer().get_context();
            this._pipeline = new Cogl.Pipeline(ctx);
            this._pipeline.set_color(this._color);
        }

        const fb = paintContext.get_framebuffer();
        const alloc = actor.get_allocation_box();
        const w = alloc.get_width();
        const h = alloc.get_height();
        const b = this._width;

        // Draw four border rectangles
        fb.draw_rectangle(this._pipeline, 0, 0, w, b);         // top
        fb.draw_rectangle(this._pipeline, 0, h - b, w, h);     // bottom
        fb.draw_rectangle(this._pipeline, 0, b, b, h - b);     // left
        fb.draw_rectangle(this._pipeline, w - b, b, w, h - b); // right
    }
});

// Apply:
const windowActor = metaWindow.get_compositor_private();
windowActor.add_effect_with_name('zed-border', new BorderEffect(color, 3));

// Remove:
windowActor.remove_effect_by_name('zed-border');
```

**Advantages:** No restacking issues, no extra scene-graph nodes, and effects propagate through `Clutter.Clone` to all shell surfaces. **Disadvantage:** More complex implementation, requires Cogl knowledge, harder to debug.

### Approach B — St.Widget child of WindowActor (recommended for badges)

Adding an `St.Label` or `St.Bin` as a direct child of the `Meta.WindowActor` makes it move with the window automatically and appear in all Clutter.Clone instances.

```javascript
const badge = new St.Label({
    text: projectName,
    style: `background-color: ${hexColor}; color: white; 
            padding: 2px 8px; border-radius: 4px; font-size: 11px;`,
    reactive: false,
});
windowActor.add_child(badge);

// Position at top-right of the window content area
const rect = metaWindow.get_frame_rect();
const actorRect = windowActor.get_allocation_box();
badge.set_position(
    rect.width - badge.width - 8,
    8  // Below CSD title bar area
);

// Update on resize
metaWindow.connect('size-changed', () => {
    const r = metaWindow.get_frame_rect();
    badge.set_position(r.width - badge.width - 8, 8);
});
```

**The actor hierarchy** for a CSD window like Zed is: `Meta.WindowActor` → `MetaSurfaceActor` (first_child, contains the texture). Your child actors sit alongside the surface actor within the WindowActor's coordinate space.

### Approach C — St.Bin sibling in global.window_group (alternative for borders)

This places a styled `St.Bin` as a sibling actor in the compositor's window group, positioned around the window using `get_frame_rect()`:

```javascript
const border = new St.Bin({
    style: `border: 3px solid ${hexColor}; border-radius: 6px;`,
});
global.window_group.add_child(border);

const rect = metaWindow.get_frame_rect();
const BORDER_SIZE = 3;
border.set_position(rect.x - BORDER_SIZE, rect.y - BORDER_SIZE);
border.set_size(rect.width + 2 * BORDER_SIZE, rect.height + 2 * BORDER_SIZE);
```

**Critical caveat:** this approach requires manual restacking via `global.display.connect('restacked', ...)` and `set_child_above_sibling()`, because the compositor doesn't know these actors belong to specific windows. It also does **not** propagate to Overview/Alt-Tab clones since the border isn't a child of the WindowActor. Use Approach A or B instead.

### Working with Zed's CSD windows

Since Zed draws its own title bar (client-side decorations), the entire visible window surface is the CSD content. `get_frame_rect()` returns the full visible bounds including Zed's title bar. There are no server-side decorations to account for. `get_buffer_rect()` may differ slightly due to invisible Wayland subsurfaces. Always use **`get_frame_rect()`** for positioning — this is confirmed as the correct method by GNOME Shell maintainer Florian Müllner.

---

## 4. Decorations propagate to every shell UI surface automatically

### Clutter.Clone paints the full actor subtree

This is the critical architectural finding. **`Clutter.Clone`** works by calling `clutter_actor_paint()` on the source actor, which performs a full paint traversal — painting the actor's own content, applying all attached `ClutterEffect` instances, and recursively painting all children. The Mutter source code confirms this through `in_cloned_branch` tracking propagated to all children.

Every GNOME Shell UI surface renders windows via `Clutter.Clone` of the `Meta.WindowActor`:

- **Activities Overview** (`windowPreview.js`): `WindowPreview` wraps a `Clutter.Clone` of the `WindowActor` inside a `WindowPreviewLayout` container, alongside its own close button and caption
- **Alt-Tab switcher** (`altTab.js`): `WindowIcon`/`WindowSwitcher` creates a `Clutter.Clone` of the window actor for thumbnail mode
- **Workspace thumbnails** (`workspaceThumbnail.js`): `WindowClone` wraps a `Clutter.Clone` scaled to fit the miniature sidebar
- **Ubuntu Dock / Dash to Dock** (`windowPreview.js` in dash-to-dock): preview popup creates a `Clutter.Clone` scaled to ~250×150px

**Both child actors (via `add_child`) and effects (via `add_effect`) propagate to ALL of these surfaces without any monkey-patching or surface-specific hooks.** This makes Approach A (effects) and Approach B (child actors) the architecturally correct choices.

| UI surface | Rendering method | Children visible? | Effects visible? |
|---|---|---|---|
| Normal desktop | Actual WindowActor | ✅ | ✅ |
| Activities Overview | Clutter.Clone | ✅ | ✅ |
| Alt-Tab switcher | Clutter.Clone | ✅ | ✅ |
| Workspace thumbnails | Clutter.Clone | ✅ | ✅ |
| Dock/Dash previews | Clutter.Clone | ✅ | ✅ |

### If surface-specific customization is needed

For cases where you want different decorations in clones versus the original (e.g., hiding badges in tiny workspace thumbnails), you can monkey-patch `WindowPreview` or `WindowClone` constructors using GNOME Shell's `InjectionManager`:

```javascript
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

enable() {
    this._injectionManager = new InjectionManager();
    this._injectionManager.overrideMethod(
        WindowPreview.WindowPreview.prototype, '_init',
        originalMethod => {
            return function(metaWindow, workspace) {
                originalMethod.call(this, metaWindow, workspace);
                // Add overview-specific decoration here
            };
        }
    );
}

disable() {
    this._injectionManager.clear();
}
```

---

## 5. Lessons from existing extensions that modify window rendering

### Rounded Window Corners (Reborn) — the gold standard

The most architecturally relevant reference is the **Rounded Window Corners** extension (originally by yilozt, actively maintained fork by flexagoon at `github.com/flexagoon/rounded-window-corners`). It uses a custom **GLSL fragment shader** applied as a `Clutter.ShaderEffect` to each `WindowActor`. The shader uses signed distance field (SDF) math to compute rounded corners and make them transparent. Because effects are part of the paint pipeline, rounded corners appear correctly in all clones — Overview, Alt-Tab, dock previews — without any special handling. The extension removes the effect during fullscreen and adjusts parameters for maximized windows.

### Tiling Shell — focused window border pattern

The **Tiling Shell** extension (github.com/domferr/tilingshell, v13.0+) implements a `WindowBorderManager` that draws a colored border around the focused window. Version 15.1 added smart border radius detection by capturing pixels of the window's left border at runtime to detect the actual corner radius — a clever technique applicable to our use case. Border width adapts to monitor scaling factor.

### gnome-colored-borders — Cogl pipeline drawing

The **gnome-colored-borders** extension (github.com/mr-sour/gnome-colored-borders) targets Qubes OS-style per-VM colored borders. It paints borders using `Cogl.Pipeline` inside a custom `Clutter.Effect` subclass's `vfunc_paint()`. This is the closest architectural precedent to our extension. The developer found that `get_allocation_box()` was unreliable for window dimensions and switched to `meta_window.get_frame_rect()`.

### GNOME Shell's built-in RedBorderEffect

GNOME Shell's own `lookingGlass.js` contains a `RedBorderEffect` used by the Inspector tool to highlight hovered objects. It draws a red border using Cogl pipelines inside a custom `Clutter.Effect`. This serves as the canonical reference for border-drawing effects within the GNOME Shell codebase itself.

---

## 6. Deterministic color assignment from codebase path

### Hash-to-hue with golden ratio distribution

The golden ratio conjugate (**137.508°**) produces maximally distributed hues even with few inputs. Combined with fixed saturation and lightness in HSL space, this yields vivid, visually distinct colors:

```javascript
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++)
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
    return hash >>> 0;
}

function projectToColor(projectName) {
    const hash = hashString(projectName);
    const hue = (hash * 137.508) % 360;
    const saturation = 75;  // percent — vivid but not neon
    const lightness = 50;   // percent — balanced visibility on light/dark
    return hslToRgba(hue, saturation, lightness);
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
```

### Override system via GSettings

Manual overrides use the `a{ss}` GVariant type (dictionary of string→string). Reading and writing in GJS:

```javascript
// Read overrides
const overrides = settings.get_value('color-overrides').deep_unpack();
// Returns: { '/home/user/my-project': '#e74c3c', ... }

// Write overrides
const dict = new GLib.Variant('a{ss}', {
    '/home/user/projects/frontend': '#3498db',
    '/home/user/projects/backend': '#e74c3c',
});
settings.set_value('color-overrides', dict);
```

The lookup flow checks overrides first, then falls back to hash-based generation. Since the window title only provides the basename, overrides should be keyed by the project name that appears in the title (e.g., `my-project`), not the full filesystem path:

```javascript
function getColorForWindow(metaWindow, settings) {
    const projectName = getProjectName(metaWindow);
    if (!projectName) return null;

    const overrides = settings.get_value('color-overrides').deep_unpack();
    if (overrides[projectName]) return overrides[projectName];

    return projectToColor(projectName);
}
```

---

## 7. Preferences UI with libadwaita widgets

The preferences window uses GNOME 45+'s `ExtensionPreferences` class with `fillPreferencesWindow()`. The import path for prefs.js uses capitalized path segments (different from extension.js):

```javascript
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ZedDecoratorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // Decoration toggles
        const toggleGroup = new Adw.PreferencesGroup({
            title: _('Decoration Types'),
        });
        page.add(toggleGroup);

        for (const [key, label, subtitle] of [
            ['border-enabled', 'Window Borders', 'Colored border around each Zed window'],
            ['overlay-enabled', 'Color Overlay', 'Subtle color tint over the window'],
            ['badge-enabled', 'Project Badge', 'Corner label showing project name'],
        ]) {
            const row = new Adw.SwitchRow({ title: _(label), subtitle: _(subtitle) });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            toggleGroup.add(row);
        }

        // Appearance settings
        const appearGroup = new Adw.PreferencesGroup({ title: _('Appearance') });
        page.add(appearGroup);

        const borderWidthRow = new Adw.SpinRow({
            title: _('Border Width'),
            subtitle: _('Pixels'),
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 10, step_increment: 1,
                value: settings.get_int('border-width'),
            }),
        });
        settings.bind('border-width', borderWidthRow.adjustment, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        appearGroup.add(borderWidthRow);

        // Color overrides page with Adw.ExpanderRow + Gtk.ColorDialogButton
        const overridesPage = new Adw.PreferencesPage({
            title: _('Color Overrides'),
            icon_name: 'preferences-color-symbolic',
        });
        window.add(overridesPage);
        // ... (add/remove override rows with Adw.ExpanderRow)
    }
}
```

**`Gtk.ColorDialogButton`** (available since GTK 4.10, ships with GNOME 45+) provides the native color picker. Pair it with `Adw.ActionRow` inside an `Adw.ExpanderRow` for each override entry, with a path text entry and delete button. Note that in GNOME 47+, `fillPreferencesWindow` supports async/await.

### Complete GSettings schema

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.gnome.shell.extensions.zed-decorator"
          path="/org/gnome/shell/extensions/zed-decorator/">
    <key name="enabled" type="b"><default>true</default></key>
    <key name="border-enabled" type="b"><default>true</default></key>
    <key name="overlay-enabled" type="b"><default>false</default></key>
    <key name="badge-enabled" type="b"><default>true</default></key>
    <key name="border-width" type="i"><default>3</default><range min="1" max="10"/></key>
    <key name="overlay-opacity" type="i"><default>15</default><range min="0" max="100"/></key>
    <key name="color-overrides" type="a{ss}"><default>{}</default></key>
  </schema>
</schemalist>
```

Compile with `glib-compile-schemas schemas/` — automatic when installed via Extension Manager or `gnome-extensions install`.

---

## 8. Technical constraints, portability, and edge cases

### Wayland-only environment

Ubuntu 25.10 removes the Xorg session entirely. **All Meta.Window methods work on Wayland**: `get_title()`, `get_wm_class()` (derived from `xdg_toplevel.app_id`), and `get_pid()` (via Wayland `SO_PEERCRED` credentials). Tools like `xprop`, `xdotool`, and `wmctrl` are non-functional — all window inspection must happen through the Meta/Mutter API within the extension. Reading `/proc/PID/cwd` is a Linux kernel feature and works regardless of display protocol, though it's not useful for Zed due to the single-process model.

### API stability across GNOME 45–49

The extension can target GNOME 45–49 with minor compatibility shims. The most impactful changes across this range are:

- **GNOME 45**: ESM migration (breaking — no backward compat with pre-45)
- **GNOME 46**: `Clutter.Container` removed — use `add_child()`/`remove_child()` exclusively
- **GNOME 48**: `global.get_window_actors()` moved to `global.compositor.get_window_actors()`; `Clutter.Image` removed (use `St.ImageContent`); `St.BoxLayout` `vertical` property deprecated (use `orientation`)
- **GNOME 49**: `Meta.Rectangle` removed — use `Mtk.Rectangle`; `AppMenuButton` removed from panel

For cross-version compatibility on the critical path:

```javascript
function getWindowActors() {
    return global.compositor?.get_window_actors?.() ?? global.get_window_actors();
}

function createRect(x, y, w, h) {
    // Mtk.Rectangle in GNOME 49+, Meta.Rectangle in older
    try { return new Mtk.Rectangle({ x, y, width: w, height: h }); }
    catch { return new Meta.Rectangle({ x, y, width: w, height: h }); }
}
```

### Performance budget

Adding **1–3 lightweight actors per Zed window** (border effect + badge label) has negligible impact — GNOME Shell itself uses hundreds of actors. The performance-critical guidelines are: avoid connecting signals that fire every frame (e.g., `notify::allocation` on rapidly animating actors), reuse actors rather than create/destroy them, and set `reactive: false` on decorative actors to skip input event processing. Using `Clutter.Effect` for borders is marginally more efficient than separate actors because effects don't add scene-graph nodes, but the difference is negligible at typical window counts (< 20).

Use `connectObject()`/`disconnectObject()` (available since GNOME 42) for automatic signal lifecycle management tied to actor destruction.

### Handling edge cases

```javascript
_getProjectName(metaWindow) {
    const title = metaWindow.get_title();
    if (!title) return null;

    // Skip non-project windows
    const skipPatterns = ['Zed', 'Welcome', 'Settings', 'Extensions'];
    if (skipPatterns.some(p => title === p || title.startsWith(p + ' ')))
        return null;

    const EM_DASH = '\u2014';
    const parts = title.split(` ${EM_DASH} `);
    return parts.length >= 2 ? parts[parts.length - 1].trim() : title.trim();
}
```

**Fullscreen transitions** — hide borders/badges when `metaWindow.is_fullscreen()` is true (connect to `notify::fullscreen`). **Minimize** — actors attached as children of `WindowActor` are hidden automatically by Mutter. **Window close** — connect to the `unmanaged` signal for cleanup. **Title changes** — connect to `notify::title` to detect project switches within the same window and update the color/badge accordingly.

---

## Recommended architecture

The optimal architecture combines **Approach A** (Cogl pipeline `Clutter.Effect` for colored borders) with **Approach B** (child `St.Label` for project badges). Both propagate through all Clutter.Clone surfaces without additional work.

```
┌─────────────────────────────────────────────────┐
│  Extension.enable()                              │
│  ├── Connect global.display 'window-created'     │
│  ├── Process existing windows                    │
│  └── Connect GSettings 'changed' signals         │
│                                                   │
│  For each Zed window (wm_class contains 'zed'):  │
│  ├── Parse project name from title                │
│  ├── Look up color (override → hash fallback)     │
│  ├── Apply BorderEffect to WindowActor            │
│  ├── Add St.Label badge as WindowActor child      │
│  ├── Connect notify::title for project changes    │
│  ├── Connect size-changed for badge repositioning │
│  └── Connect unmanaged for cleanup                │
│                                                   │
│  Propagation: automatic via Clutter.Clone          │
│  ├── Activities Overview  ✅                       │
│  ├── Alt-Tab              ✅                       │
│  ├── Workspace thumbnails ✅                       │
│  └── Dock previews        ✅                       │
└─────────────────────────────────────────────────┘
```

## Conclusion

Three architectural decisions define this extension. First, **window title parsing is the only viable per-project identification method** — Zed's single-process model eliminates all process-level inspection techniques, and there are no custom window properties. Second, **decorations attached to `Meta.WindowActor`** (as children or effects) propagate automatically to every shell UI surface through Clutter.Clone's full-subtree painting behavior, eliminating the need for per-surface monkey-patching. Third, the **Cogl pipeline effect approach** provides the cleanest border rendering — no restacking issues, no extra scene-graph nodes, and proven in production by gnome-colored-borders and GNOME Shell's own RedBorderEffect. The one genuine limitation is that identically-named project directories will receive the same color, addressable only by manual overrides until Zed implements configurable window titles (upstream issue #14534).