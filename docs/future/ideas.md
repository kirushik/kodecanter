# Future Ideas

Collected feature ideas and improvement plans. Not prioritized — just a parking lot.

## Features

- **Support more editors** — VS Code, Neovim (via terminal title), JetBrains IDEs. Each has different title/WM_CLASS patterns.
- **Focus highlight** — brighten or thicken the border on the focused window, dim others.
- **Per-workspace colors** — combine project color with workspace indicator.
- **Color palette modes** — alternative to golden-angle: user-defined palette, pastel mode, high-contrast mode.

## Technical improvements

- **Unit tests** — `colorResolver.test.ts` and `titleParser.test.ts` under Node.js (need to pick a test runner that doesn't require npm, or accept a minimal `package.json` devDep).
- **`connectObject`/`disconnectObject` migration** — `windowTracker.ts` still uses bare `connect()`. Should use the GNOME Shell signal lifecycle helpers.
- **`resource:///org/gnome/shell/ui/main.js` type shim** — currently points to gnome-shell submodule source; may need a local shim if future code imports `Main`.

## Documentation

- **Animated GIF/video** in README showing the extension in action.
- **extensions.gnome.org listing** once stable.
