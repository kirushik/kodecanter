UUID = kodecanter@kirushik.github.io
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all build install dev pack clean check

all: build

# ── Build ────────────────────────────────────────
build: dist/extension.js schemas/gschemas.compiled
	@cp metadata.json dist/
	@cp stylesheet.css dist/
	@cp -r schemas dist/

dist/extension.js: $(wildcard src/*.ts) tsconfig.json ambient.d.ts
	tsc

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas

# ── Type checking ────────────────────────────────
check:
	tsc --noEmit

# ── Install to local extensions dir ──────────────
install: build
	@mkdir -p $(INSTALL_DIR)
	@cp -r dist/* $(INSTALL_DIR)/
	@echo "Installed to $(INSTALL_DIR). Log out and back in for changes to take effect."

# ── Launch nested Wayland session for testing ────
# LD_PRELOAD works around a symbol resolution bug where dbus-run-session
# prevents libmutter from finding XSetIOErrorExitHandler in libX11.
dev: install
	dbus-run-session -- env LD_PRELOAD=/lib/x86_64-linux-gnu/libX11.so.6 gnome-shell --devkit

# ── Package for distribution ─────────────────────
pack: build
	@(cd dist && zip -qr ../$(UUID).zip *)

# ── Cleanup ──────────────────────────────────────
clean:
	rm -rf dist $(UUID).zip schemas/gschemas.compiled
