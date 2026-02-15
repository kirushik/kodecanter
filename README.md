# Kodecanter

_Zed's beautiful. Now tell them apart._

![Kodecanter concept](docs/kodecanter.png)

A GNOME Shell 49 extension that colors [Zed](https://zed.dev) editor windows by project — giving each codebase a unique hue so you can tell them apart at a glance.

## Features

- **Colored borders** — GLSL rounded-rectangle border rendered via `Clutter.ShaderEffect`, matching your DE's corner radius
- **Project badges** — small label at the top-right showing the project name
- **Color overlay** — subtle tint over the entire window (off by default)
- **Automatic color assignment** — deterministic hash maps project names to distinct hues via golden-angle distribution
- **Manual overrides** — pin specific colors to projects in the preferences UI
- **Live updates** — all settings take effect immediately, no restart needed
- **Clone-aware** — decorations appear in Overview, Alt-Tab, and dock previews automatically

## Requirements

- GNOME Shell 49 (Wayland)
- Zed editor

## Install

### From source

```sh
git clone --recurse-submodules https://github.com/kirushik/kodecanter.git
cd kodecanter
make build
make install
```

Then restart GNOME Shell (log out/in on Wayland) and enable:

```sh
gnome-extensions enable kodecanter@kirushik.github.io
```

### From zip

```sh
make pack
gnome-extensions install kodecanter@kirushik.github.io.zip
```

## Settings

Open via `gnome-extensions prefs kodecanter@kirushik.github.io` or the Extensions app.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `border-enabled` | bool | `true` | Show colored rounded borders |
| `badge-enabled` | bool | `true` | Show project name badges |
| `overlay-enabled` | bool | `false` | Show color overlay on window |
| `border-width` | int | `3` | Border thickness (1-10 px) |
| `border-radius` | int | `12` | Border corner radius (0-24 px) |
| `overlay-opacity` | int | `15` | Overlay opacity (0-100%) |
| `color-overrides` | dict | `{}` | Project name -> hex color overrides |

## How it works

Zed sets each window's title to `{filename} — {project_basename}` (with an em-dash). Kodecanter watches for Zed windows via WM_CLASS, parses the project name from the title, and assigns a color using a deterministic hash. The color drives three optional decorations — a GLSL SDF border effect, an `St.Label` badge, and a shader overlay — all attached to the `Meta.WindowActor` so they propagate through Clutter clones.

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions and architecture details.

## License

[GPLv3](LICENSE)
